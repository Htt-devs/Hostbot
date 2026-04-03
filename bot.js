import express from 'express';
import cors from 'cors';
import { Client, GatewayIntentBits, ChannelType, EmbedBuilder, SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import AdmZip from 'adm-zip';
import axios from 'axios';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));           // Serve a pasta public
app.use(express.static(path.join(__dirname, 'public'))); // Backup para Render

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ]
});

const hostedBots = new Map();      // Bots que aparecem no painel
const ticketsEmProgresso = new Map();

// ==================== DISCORD BOT ====================
client.once('ready', () => {
  console.log(`✅ Bot Discord online como ${client.user.tag}`);
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isCommand() || interaction.commandName !== 'host') return;

  const guild = interaction.guild;
  const user = interaction.user;

  const ticketChannel = await guild.channels.create({
    name: `📦-host-${user.username}`,
    type: ChannelType.GuildText,
    permissionOverwrites: [
      { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
      { id: user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.AttachFiles] }
    ]
  });

  ticketsEmProgresso.set(ticketChannel.id, {
    userId: user.id,
    username: user.username,
    etapa: 1,
    ram: null,
    mainFile: null
  });

  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle('🚀 Hospedagem de Bot')
    .setDescription('**Etapa 1/3 - RAM**\n\nQuanto de RAM seu bot vai usar?\n\nExemplos: `128MB`, `256MB`, `512MB`, `1GB`')
    .setTimestamp();

  await ticketChannel.send({ embeds: [embed] });
  await interaction.reply({ content: `✅ Ticket criado! → ${ticketChannel}`, ephemeral: true });
});

client.on('messageCreate', async message => {
  if (message.author.bot) return;
  if (!message.channel.name.startsWith('📦-host-')) return;

  const ticket = ticketsEmProgresso.get(message.channel.id);
  if (!ticket || ticket.userId !== message.author.id) return;

  // Etapa 1: RAM
  if (ticket.etapa === 1) {
    let ram = 0;
    const input = message.content.toUpperCase().trim().replace(/\s/g, '');

    if (input.endsWith('GB')) ram = parseFloat(input) * 1024;
    else if (input.endsWith('MB')) ram = parseFloat(input);
    else ram = parseFloat(input);

    if (isNaN(ram) || ram < 64) return message.reply('❌ RAM inválida! Use 128MB, 256MB, 512MB ou 1GB.');

    ticket.ram = Math.floor(ram);
    ticket.etapa = 2;
    await message.delete().catch(() => {});

    const embed = new EmbedBuilder()
      .setColor(0x00BFFF)
      .setTitle('📁 Etapa 2/3')
      .setDescription(`**RAM:** ${ticket.ram} MB\n\nQual é o arquivo principal? (ex: index.js)`);

    await message.channel.send({ embeds: [embed] });
    return;
  }

  // Etapa 2: Arquivo principal
  if (ticket.etapa === 2) {
    ticket.mainFile = message.content.trim();
    ticket.etapa = 3;
    await message.delete().catch(() => {});

    const embed = new EmbedBuilder()
      .setColor(0x57F287)
      .setTitle('📦 Etapa 3/3')
      .setDescription('Envie o arquivo **.zip** completo do seu bot.');

    await message.channel.send({ embeds: [embed] });
    return;
  }

  // Etapa 3: ZIP
  if (ticket.etapa === 3 && message.attachments.size > 0) {
    const attachment = message.attachments.first();
    if (!attachment.name.toLowerCase().endsWith('.zip')) {
      return message.reply('❌ Envie um arquivo .zip válido.');
    }

    await message.delete().catch(() => {});

    try {
      const response = await axios.get(attachment.url, { responseType: 'arraybuffer' });
      const zip = new AdmZip(response.data);
      const entries = zip.getEntries();

      const mainExists = entries.some(e => 
        e.entryName === ticket.mainFile || e.entryName.endsWith('/' + ticket.mainFile)
      );

      if (!mainExists) {
        return message.channel.send(`❌ Arquivo **${ticket.mainFile}** não encontrado no ZIP.`);
      }

      const botId = `bot-${Date.now().toString(36)}`;

      hostedBots.set(botId, {
        id: botId,
        nome: `Bot de ${ticket.username}`,
        ram: ticket.ram,
        mainFile: ticket.mainFile,
        status: 'online',
        usuario: ticket.username,
        criadoEm: new Date().toISOString()
      });

      const success = new EmbedBuilder()
        .setColor(0x00FF00)
        .setTitle('✅ Bot Hospedado com Sucesso!')
        .addFields(
          { name: 'ID', value: botId },
          { name: 'RAM', value: `${ticket.ram} MB` },
          { name: 'Principal', value: ticket.mainFile }
        );

      await message.channel.send({ embeds: [success] });

      setTimeout(() => message.channel.delete().catch(() => {}), 10000);

    } catch (err) {
      console.error(err);
      await message.channel.send('❌ Erro ao processar o ZIP. Tente novamente.');
    }

    ticketsEmProgresso.delete(message.channel.id);
  }
});

// ==================== API + PAINEL WEB ====================
app.get('/api/bots', (req, res) => {
  res.json(Array.from(hostedBots.values()));
});

app.post('/api/bots/:id/:action', (req, res) => {
  const bot = hostedBots.get(req.params.id);
  if (!bot) return res.status(404).json({ error: 'Bot não encontrado' });

  if (req.params.action === 'start' || req.params.action === 'restart') bot.status = 'online';
  if (req.params.action === 'stop') bot.status = 'offline';

  res.json({ success: true });
});

// Rota principal - força carregar o index.html
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🌐 Painel web rodando na porta ${PORT}`);
  console.log(`Acesse: https://${process.env.RENDER_EXTERNAL_HOSTNAME || 'seu-link'}.onrender.com`);
});

client.login(process.env.DISCORD_TOKEN).catch(err => {
  console.error('❌ Erro no login:', err.message);
});
