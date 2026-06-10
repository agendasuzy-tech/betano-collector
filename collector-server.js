// ============================================================
// BETANO COLLECTOR - Server que roda 24/7 no Render.com
// Versão com proxy Cloudflare Worker (resolve bloqueio de IP)
// ============================================================

require('dotenv').config();
const express = require('express');
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3000;

const PROXY_URL = process.env.PROXY_URL || 'https://betano-proxy.agendasuzy.workers.dev';

const SUPABASE_URL = 'https://wwicknifzoeusrmganye.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind3aWNrbmlmem9ldXNybWdhbnllIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA4NDc0NDQsImV4cCI6MjA5NjQyMzQ0NH0.fq8QCF32YyJ2yonDfHVXTK5hP_c8gSKTk2bg4jlal3U';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

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

let collectionStats = {
  lastRun: null,
  totalMatches: 0,
  newMatches: 0,
  nextRun: null,
  totalCollections: 0,
};

async function insertOrGetLeague(betanoId, name) {
  try {
    const { data: existing } = await supabase
      .from('ligas')
      .select('id')
      .eq('betano_league_id', betanoId)
      .single();

    if (existing) return existing.id;

    const { data, error } = await supabase
      .from('ligas')
      .insert({ betano_league_id: betanoId, name: name })
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
    const get = (t) => event.statistics?.find(s => s.statisticsType === t)?.value?.score ?? '0';
    const ftH = parseInt(get('FullTimeHomeTeam'));
    const ftA = parseInt(get('FullTimeAwayTeam'));
    const htH = parseInt(get('HalfTimeHomeTeam'));
    const htA = parseInt(get('HalfTimeAwayTeam'));

    const homeTeam = event.displayNameParts?.[0]?.name ?? 'Unknown';
    const awayTeam = event.displayNameParts?.[1]?.name ?? 'Unknown';
    const resultado = ftH > ftA ? 'Casa' : ftA > ftH ? 'Fora' : 'Empate';

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
      if (matchError.code === '23505') return null;
      throw matchError;
    }

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
        await supabase.from('odds').insert(odds).catch(e => console.error('Erro odds:', e));
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
    const url = `${PROXY_URL}?leagueId=${leagueId}`;
    const response = await axios.get(url, { timeout: 15000 });

    // LOG para debug
    const rawData = response.data;
    console.log(`[${leagueName}] tipo:`, typeof rawData, '| keys:', Object.keys(rawData || {}).join(','));

    // Suporta tanto string quanto objeto
    const parsed = typeof rawData === 'string' ? JSON.parse(rawData) : rawData;

    if (!parsed?.data?.results) {
      console.log(`[${leagueName}] Sem results! Keys:`, Object.keys(parsed || {}));
      return { novos: 0, total: 0, erro: 'Dados vazios' };
    }

    let novos = 0;
    let total = 0;

    const leagueDbId = await insertOrGetLeague(leagueId, leagueName);
    if (!leagueDbId) return { novos: 0, total: 0, erro: 'Erro ao inserir liga' };

    for (const round of parsed.data.results) {
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
  const startTime = Date.now();
  collectionStats.totalCollections++;
  collectionStats.lastRun = new Date();

  console.log(`\n[${collectionStats.totalCollections}] ⚡ COLETA - ${collectionStats.lastRun.toLocaleString('pt-BR')}`);

  const results = await Promise.all(
    LEAGUES.map(league => collectLeague(league.id, league.name))
  );

  let totalNovos = 0;
  let totalMatches = 0;
  results.forEach(r => { totalNovos += r.novos; totalMatches += r.total; });

  if (totalNovos > 0) {
    await supabase.from('collection_logs').insert({
      total_matches: totalMatches,
      new_matches: totalNovos,
      status: 'success',
    }).catch(e => console.error('Erro log:', e));
  }

  collectionStats.totalMatches = totalMatches;
  collectionStats.newMatches = totalNovos;
  collectionStats.nextRun = new Date(Date.now() + 60 * 1000);

  const duration = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`✅ ${totalNovos}/${totalMatches} partidas em ${duration}s`);
}

app.get('/', (req, res) => {
  res.json({
    status: '✅ Betano Collector rodando (via Cloudflare Proxy)!',
    proxy: PROXY_URL,
    stats: collectionStats,
    ligas: LEAGUES.length,
  });
});

app.get('/status', (req, res) => res.json(collectionStats));

app.get('/collect-now', async (req, res) => {
  try {
    await runCollectionCycle();
    res.json({ success: true, stats: collectionStats });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`\n🚀 Betano Collector rodando na porta ${PORT}`);
  console.log(`🌐 Proxy: ${PROXY_URL}`);
  console.log(`📊 Supabase: ${SUPABASE_URL}`);
  console.log(`📋 12 ligas a cada 1 MINUTO\n`);

  runCollectionCycle();
  setInterval(runCollectionCycle, 60 * 1000);
});
