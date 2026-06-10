# ⚡ VELOCIDADES DE COLETA

## Você tem 2 opções:

### 1️⃣ **collector-server.js** (PADRÃO)
- ⏱️ Coleta a cada **1 MINUTO**
- ✅ Menos pesado no servidor
- ✅ Menos requisições à API do Betano
- ✅ Recomendado para começar
- 📊 Ótimo custo-benefício

```
Betano API → [resposta] → Supabase → Dashboard atualiza
        ↓
    espera 1 min
```

---

### 2️⃣ **collector-server-fast.js** (ULTRA RÁPIDO) ⚡
- ⏱️ Coleta a cada **30 SEGUNDOS**
- 🚀 Resultados aparecem em tempo REAL
- ⚠️ Mais pesado no servidor
- ⚠️ Mais requisições à API
- 📱 Ideal se quer dados SUPER atualizados

```
Betano API → [resposta] → Supabase → Dashboard atualiza
        ↓
    espera 30s
```

---

## 🎯 Qual escolher?

### Escolha **PADRÃO (1 minuto)** se:
- Quer começar sem complicações
- Não precisa de atualizações SUPER rápidas
- Quer economizar recursos

### Escolha **FAST (30 segundos)** se:
- Quer dados em tempo REAL
- Os jogos são muito rápidos
- Quer máxima precisão

---

## 🔧 Como trocar?

**Se escolher FAST (30 segundos):**

1. No seu repositório GitHub, delete: `collector-server.js`
2. Renomeie: `collector-server-fast.js` → `collector-server.js`
3. Faça push
4. Render redeploy automaticamente!

**Pronto! Agora coleta a cada 30 segundos!**

---

## 📊 Diferenças Técnicas:

| Aspecto | 1 Minuto | 30 Segundos |
|---------|----------|-------------|
| Intervalo | 60s | 30s |
| Requisições/hora | 60 | 120 |
| Delay | ~1 minuto | ~30 segundos |
| Performance | Ótima | Boa |
| Recomendado | ✅ Sim | Para tempo real |
| Dashboard refresh | A cada 30s | A cada 15s |

---

## 💡 Minha Recomendação:

**Comece com a versão de 1 MINUTO** (`collector-server.js`)

Se achar que é muito lento, troque para **30 SEGUNDOS** (`collector-server-fast.js`)

Ambas são otimizadas e funcionam bem! 🚀

---

## ⚙️ Você pode até fazer versões customizadas:

Se quiser **45 segundos** ou **15 segundos**, é só alterar essa linha:

```javascript
setInterval(runCollectionCycle, 30 * 1000); // Mude 30 para o número que quiser
```

- `30 * 1000` = 30 segundos
- `60 * 1000` = 1 minuto
- `15 * 1000` = 15 segundos
- `5 * 1000` = 5 segundos

---

## 🎬 Conclusão:

- **Por padrão**: 1 minuto
- **Se quiser mais rápido**: 30 segundos
- **Customizável**: qualquer intervalo!

**Qualquer dúvida, é só avisar!** 🚀
