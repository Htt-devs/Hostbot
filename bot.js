import { Client, GatewayIntentBits, ChannelType, EmbedBuilder, SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import AdmZip from 'adm-zip';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ]
});

const ticketsEmProgresso = new Map(); // ticketId → dados

client.once('ready', () => {
  console.log(`✅ Bot Hospedeiro online como ${client.user.tag}`);

  const commands = [
    new SlashCommandBuilder()
      .setName('host')
      .setDescription('Iniciar processo de hospedagem de bot')
  ].map(cmd => cmd.toJSON());

  client.application.commands.set(commands)
    .then(() => console.log('✅ Comandos slash registrados com sucesso'))
    .catch(err => console.error('❌ Erro ao registrar comandos:', err));
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isCommand()) return;

  if (interaction.commandName === 'host') {
    const guild = interaction.guild;
    const user = interaction.user;

    try {
      const ticketChannel = await guild.channels.create({
        name: `📦-host-${user.username}`,
        type: ChannelType.GuildText,
        permissionOverwrites: [
          { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
          { id: user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.ReadMessageHistory] }
        ]
      });

      ticketsEmProgresso.set(ticketChannel.id, {
        userId: user.id,
        etapa: 1,
        ram: null,
        mainFile: null
      });

      const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('🚀 Assistente de Hospedagem')
        .setDescription('**Etapa 1/3 - RAM**\n\nQuanto de RAM seu bot vai usar?\n\nExemplos válidos:\n`128MB` • `256MB` • `512MB` • `1GB`')
        .setFooter({ text: 'Digite apenas o valor' })
        .setTimestamp();

      await ticketChannel.send({ embeds: [embed] });

      await interaction.reply({ 
        content: `✅ Ticket criado com sucesso!\nVá para: ${ticketChannel}`, 
        ephemeral: true 
      });
    } catch (error) {
      console.error('Erro ao criar ticket:', error);
      await interaction.reply({ content: '❌ Erro ao criar o ticket. Tente novamente.', ephemeral: true });
    }
  }
});

client.on('messageCreate', async message => {
  if (message.author.bot) return;
  if (!message.channel.name.startsWith('📦-host-')) return;

  const ticket = ticketsEmProgresso.get(message.channel.id);
  if (!ticket || ticket.userId !== message.author.id) return;

  // ==================== ETAPA 1: RAM ====================
  if (ticket.etapa === 1) {
    let ram = 0;
    const input = message.content.toUpperCase().trim().replace(/\s/g, '');

    if (input.endsWith('GB')) ram = parseFloat(input) * 1024;
    else if (input.endsWith('MB')) ram = parseFloat(input);
    else ram = parseFloat(input);

    if (isNaN(ram) || ram < 64) {
      return message.reply('❌ RAM inválida! Use exemplos: `128MB`, `256MB`, `512MB` ou `1GB`');
    }

    ticket.ram = Math.floor(ram);
    ticket.etapa = 2;
    await message.delete().catch(() => {});

    const embed2 = new EmbedBuilder()
      .setColor(0x00BFFF)
      .setTitle('📁 Etapa 2/3 - Arquivo Principal')
      .setDescription(`**RAM definida:** ${ticket.ram} MB\n\nQual é o **arquivo principal** do seu bot?\n\nExemplos: \`index.js\`, \`bot.js\`, \`main.py\``)
      .setFooter({ text: 'Digite o nome exato do arquivo' })
      .setTimestamp();

    await message.channel.send({ embeds: [embed2] });
    return;
  }

  // ==================== ETAPA 2: ARQUIVO PRINCIPAL ====================
  if (ticket.etapa === 2) {
    ticket.mainFile = message.content.trim();
    ticket.etapa = 3;
    await message.delete().catch(() => {});

    const embed3 = new EmbedBuilder()
      .setColor(0x57F287)
      .setTitle('📦 Etapa 3/3 - Envie o ZIP')
      .setDescription(`**RAM:** \( {ticket.ram} MB\n**Arquivo Principal:** \` \){ticket.mainFile}\`\n\nAgora envie o arquivo **.zip** completo do seu bot.`)
      .setFooter({ text: 'Apenas 1 arquivo .zip' })
      .setTimestamp();

    await message.channel.send({ embeds: [embed3] });
    return;
  }

  // ==================== ETAPA 3: ZIP ====================
  if (ticket.etapa === 3 && message.attachments.size > 0) {
    const attachment = message.attachments.first();

    if (!attachment.name.toLowerCase().endsWith('.zip')) {
      return message.reply('❌ O arquivo deve ser um **.zip** válido.');
    }

    await message.delete().catch(() => {});

    const processing = new EmbedBuilder()
      .setColor(0xF1C40F)
      .setTitle('⏳ Processando...')
      .setDescription('Baixando e verificando seu bot...');

    await message.channel.send({ embeds: [processing] });

    try {
      const response = await axios.get(attachment.url, { responseType: 'arraybuffer' });
      const zip = new AdmZip(response.data);
      const entries = zip.getEntries();

      const mainExists = entries.some(entry => 
        entry.entryName === ticket.mainFile || 
        entry.entryName.endsWith('/' + ticket.mainFile) ||
        entry.entryName.endsWith('\\' + ticket.mainFile)
      );

      if (!mainExists) {
        return message.channel.send(`❌ Arquivo principal **${ticket.mainFile}** não encontrado no ZIP.`);
      }

      const botId = `bot-${Date.now().toString(36).toUpperCase()}`;

      const successEmbed = new EmbedBuilder()
        .setColor(0x00FF00)
        .setTitle('✅ Bot Analisado com Sucesso!')
        .setDescription('O arquivo foi verificado corretamente.')
        .addFields(
          { name: '🆔 ID do Bot', value: botId, inline: true },
          { name: '💾 RAM', value: `${ticket.ram} MB`, inline: true },
          { name: '📄 Principal', value: `\`${ticket.mainFile}\``, inline: true }
        )
        .setTimestamp();

      await message.channel.send({ embeds: [successEmbed] });

      // Fecha o ticket automaticamente
      setTimeout(() => message.channel.delete().catch(() => {}), 10000);

    } catch (err) {
      console.error('Erro ao processar ZIP:', err);
      await message.channel.send('❌ Erro ao processar o arquivo ZIP. Tente enviar novamente.');
    }

    ticketsEmProgresso.delete(message.channel.id);
  }
});

// ==================== LOGIN ====================
const TOKEN = process.env.DISCORD_TOKEN;

if (!TOKEN) {
  console.error('❌ DISCORD_TOKEN não foi encontrado nas variáveis de ambiente do Render!');
  console.error('Adicione a variável DISCORD_TOKEN no painel do Render.');
  process.exit(1);
}

console.log('🔑 Tentando conectar ao Discord...');

client.login(TOKEN).catch(err => {
  console.error('❌ Erro ao fazer login:');
  console.error(err.message);
  
  if (err.code === 'TokenInvalid') {
    console.error('\n⚠️ Token inválido ou expirado.');
    console.error('Regenere o token no Discord Developer Portal e atualize no Render.');
  }
});
