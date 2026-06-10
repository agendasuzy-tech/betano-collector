// ============================================================
// BETANO COLLECTOR - Server que roda 24/7 no Render.com
// ============================================================
// npm install express axios dotenv @supabase/supabase-js

require('dotenv').config();
const express = require('express');
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3000;

// Configuração Supabase
const SUPABASE_URL = 'https://wwicknifzoeusrmganye.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind3aWNrbmlmem9ldXNybWdhbnllIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA4NDc0NDQsImV4cCI6MjA5NjQyMzQ0NH0.fq8QCF32YyJ2yonDfHVXTK5hP_c8gSKTk2bg4jlal3U';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Ligas para coletar
const LEAGUES = [
  { id: 206286, name: 'World' },
  { id: 204676, name: 'Brasileirão Betano' },
  { id: 203063, name: 'Copa América' },
  { id: 203064, name: 'Euro' },
  { id: 197476, name: 'Ligas América' },
  { id: 199959, name: 'Clássicos da América' },
  { id: 203911, name: 'British Derbies' },
  { id: 203912, name: 'Liga Espanhola' },
  { id: 203913, name: 'Scudetto Italiano' },
  { id: 199961, name: 'Campeonato Italiano' },
  { id: 199960, name: 'Copa das Estrelas' },
  { id: 199330, name: 'Campeões' },
];

// Status global
let collectionStats = {
  lastRun: null,
  totalMatches: 0,
  newMatches: 0,
  nextRun: null,
};

// ============================================================
// FUNÇÕES DE COLETA
// ============================================================

async function insertOrGetLeague(betanoId, name) {
  try {
    // Verificar se liga já existe
    const { data: existing } = await supabase
      .from('ligas')
      .select('id')
      .eq('betano_league_id', betanoId)
      .single();

    if (existing) {
      return existing.id;
    }

    // Inserir nova liga
    const { data, error } = await supabase
      .from('ligas')
      .insert({
        betano_league_id: betanoId,
        name: name,
      })
      .select()
      .single();

    if (error) throw error;
    return data.id;
  } catch (error) {
    console.error(`Erro ao inserir liga ${name}:`, error);
    return null;
  }
}

async function parseAndSaveMatch(event, leagueId, leagueName, startTime) {
  try {
    // Parse dos dados
    const get = (t) => event.statistics?.find(s => s.statisticsType === t)?.value?.score ?? '0';
    const ftH = parseInt(get('FullTimeHomeTeam'));
    const ftA = parseInt(get('FullTimeAwayTeam'));
    const htH = parseInt(get('HalfTimeHomeTeam'));
    const htA = parseInt(get('HalfTimeAwayTeam'));

    const homeTeam = event.displayNameParts?.[0]?.name ?? 'Unknown';
    const awayTeam = event.displayNameParts?.[1]?.name ?? 'Unknown';

    // Resultado
    const resultado = ftH > ftA ? 'Casa' : ftA > ftH ? 'Fora' : 'Empate';

    // Inserir match
    const { data: matchData, error: matchError } = await supabase
      .from('matches')
      .insert({
        betano_match_id: event.id,
        league_id: leagueId,
        home_team: homeTeam,
        away_team: awayTeam,
        match_time: startTime,
        full_time_home: ftH,
        full_time_away: ftA,
        half_time_home: htH,
        half_time_away: htA,
        result: resultado,
        total_goals: ftH + ftA,
        correct_score: `${ftH}-${ftA}`,
      })
      .select()
      .single();

    if (matchError) {
      // Se já existe, ignorar
      if (matchError.code === '23505') {
        return null;
      }
      throw matchError;
    }

    // Salvar odds
    if (event.markets && matchData) {
      const odds = [];
      event.markets.forEach(market => {
        if (market.selections) {
          market.selections.forEach(selection => {
            odds.push({
              match_id: matchData.id,
              market_type: market.name,
              selection: selection.name,
              odd_value: parseFloat(selection.odd),
            });
          });
        }
      });

      if (odds.length > 0) {
        const { error: oddsError } = await supabase
          .from('odds')
          .insert(odds);
        
        if (oddsError) {
          console.error('Erro ao salvar odds:', oddsError);
        }
      }
    }

    return matchData;
  } catch (error) {
    console.error('Erro ao parsear match:', error);
    return null;
  }
}

async function collectLeague(leagueId, leagueName) {
  try {
    const url = `https://www.betano.bet.br/api/virtuals/resultsdata?leagueId=${leagueId}&req=tn,stnf,c`;
    
    const response = await axios.get(url, {
      headers: {
        'accept': 'application/json',
        'User-Agent': 'Mozilla/5.0',
      },
    });

    if (!response.data?.data?.results) {
      return { novos: 0, total: 0, erro: 'Dados vazios' };
    }

    let novos = 0;
    let total = 0;

    // Obter ID da liga no Supabase
    const leagueDbId = await insertOrGetLeague(leagueId, leagueName);
    if (!leagueDbId) {
      return { novos: 0, total: 0, erro: 'Erro ao inserir liga' };
    }

    // Processar cada rodada
    for (const round of response.data.data.results) {
      if (round.events) {
        for (const event of round.events) {
          total++;
          const result = await parseAndSaveMatch(event, leagueDbId, leagueName, round.startTime);
          if (result) novos++;
        }
      }
    }

    console.log(`✓ ${leagueName}: ${novos} novo(s) de ${total}`);
    return { novos, total, erro: null };
  } catch (error) {
    console.error(`✗ Erro ao coletar ${leagueName}:`, error.message);
    return { novos: 0, total: 0, erro: error.message };
  }
}

async function runCollectionCycle() {
  console.log('\n' + '='.repeat(60));
  console.log(`📊 INICIANDO COLETA - ${new Date().toLocaleString('pt-BR')}`);
  console.log('='.repeat(60));

  collectionStats.lastRun = new Date();
  let totalNovos = 0;
  let totalMatches = 0;

  // Coletar todas as ligas
  for (const league of LEAGUES) {
    const result = await collectLeague(league.id, league.name);
    totalNovos += result.novos;
    totalMatches += result.total;
  }

  // Salvar log de coleta
  try {
    await supabase.from('collection_logs').insert({
      total_matches: totalMatches,
      new_matches: totalNovos,
      status: totalNovos > 0 ? 'success' : 'partial',
    });
  } catch (error) {
    console.error('Erro ao salvar log:', error);
  }

  collectionStats.totalMatches = totalMatches;
  collectionStats.newMatches = totalNovos;
  collectionStats.nextRun = new Date(Date.now() + 1 * 60 * 1000); // Próxima em 1 minuto

  console.log(`\n✅ COLETA FINALIZADA`);
  console.log(`📈 Total de partidas: ${totalMatches}`);
  console.log(`🆕 Novas partidas: ${totalNovos}`);
  console.log(`⏰ Próxima coleta: ${collectionStats.nextRun.toLocaleString('pt-BR')}`);
  console.log('='.repeat(60) + '\n');
}

// ============================================================
// ROTAS EXPRESS
// ============================================================

app.get('/', (req, res) => {
  res.json({
    status: '✅ Betano Collector está rodando!',
    stats: collectionStats,
    ligas: LEAGUES.length,
    message: 'Coletando dados a cada 30 minutos',
  });
});

app.get('/status', (req, res) => {
  res.json(collectionStats);
});

app.get('/collect-now', async (req, res) => {
  try {
    await runCollectionCycle();
    res.json({ success: true, stats: collectionStats });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

// ============================================================
// INICIA O SERVIDOR
// ============================================================

app.listen(PORT, () => {
  console.log(`🚀 Betano Collector Server rodando na porta ${PORT}`);
  console.log(`📍 URL: https://seu-app.onrender.com`);
  console.log(`📊 Supabase: ${SUPABASE_URL}`);
  console.log(`📋 12 ligas serão coletadas a cada 1 MINUTO\n`);
  
  // Primeira coleta imediatamente
  runCollectionCycle();
  
  // Próximas coletas a cada 1 MINUTO - TEMPO REAL!
  setInterval(runCollectionCycle, 1 * 60 * 1000);
});
