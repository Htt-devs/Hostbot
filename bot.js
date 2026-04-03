import express from 'express';
import cors from 'cors';
import axios from 'axios';

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// ==================== AUTH DISCORD ====================
app.get('/auth/discord', (req, res) => {
  const authUrl = "https://discord.com/oauth2/authorize?client_id=1485093454517371070&response_type=code&redirect_uri=https://hostbot-i05r.onrender.com/auth/discord/callback&scope=identify";
  console.log("🔗 Redirecionando para Discord...");
  res.redirect(authUrl);
});

app.get('/auth/discord/callback', async (req, res) => {
  const code = req.query.code;

  if (!code) {
    console.log("❌ Nenhum code recebido");
    return res.send("Erro: Nenhum código recebido do Discord. Volte e clique no botão novamente.");
  }

  console.log("✅ Code recebido:", code);

  try {
    const tokenResponse = await axios.post('https://discord.com/api/oauth2/token', {
      client_id: "1485093454517371070",
      client_secret: "seEdu7PPJBi3mjAUecNvCYbIeo4HVfMG",
      grant_type: "authorization_code",
      code: code,
      redirect_uri: "https://hostbot-i05r.onrender.com/auth/discord/callback"
    }, {
      headers: { "Content-Type": "application/x-www-form-urlencoded" }
    });

    console.log("✅ Token recebido com sucesso");

    const userResponse = await axios.get('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${tokenResponse.data.access_token}` }
    });

    console.log(`🎉 Login bem-sucedido! Usuário: ${userResponse.data.username}`);

    res.redirect('/');  // volta para o painel principal

  } catch (err) {
    console.error("Erro completo no callback:", err.response ? err.response.data : err.message);
    res.send(`Erro ao conectar com Discord.<br><br>Detalhe: ${err.message}`);
  }
});

// API simples
app.get('/api/bots', (req, res) => res.json([])); // temporário

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🌐 Painel rodando em http://localhost:${PORT}`);
});
