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

const ticketsEmProgresso = new Map(); // ticketId → dados do ticket

client.once('ready', () => {
  console.log(`✅ Bot Hospedeiro online como ${client.user.tag}`);

  const commands = [
    new SlashCommandBuilder()
      .setName('host')
      .setDescription('Iniciar processo de hospedagem de bot')
  ].map(cmd => cmd.toJSON());

  client.application.commands.set(commands)
    .then(() => console.log('✅ Comandos slash registrados'))
    .catch(console.error);
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isCommand()) return;

  if (interaction.commandName === 'host') {
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
      etapa: 1,
      ram: null,
      mainFile: null
    });

    const embed = new EmbedBuilder()
      .setColor(0x7C3AED)
      .setTitle('🚀 Assistente de Hospedagem')
      .setDescription('**Etapa 1/3 - RAM**\n\nQuanto de RAM seu bot vai usar?\n\nExemplos: `128MB`, `256MB`, `512MB`, `1GB`')
      .setTimestamp();

    await ticketChannel.send({ embeds: [embed] });
    await interaction.reply({ content: `✅ Ticket criado! Vá para ${ticketChannel}`, ephemeral: true });
  }
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

    if (isNaN(ram) || ram < 64) {
      return message.reply('❌ RAM inválida! Use 128MB, 256MB, 1GB, etc.');
    }

    ticket.ram = Math.floor(ram);
    ticket.etapa = 2;
    await message.delete().catch(() => {});

    const embed2 = new EmbedBuilder()
      .setColor(0x00BFFF)
      .setTitle('📁 Etapa 2/3')
      .setDescription(`**RAM definida:** ${ticket.ram} MB\n\nQual é o **arquivo principal** do seu bot?\nEx: \`index.js\`, \`bot.js\`, \`main.py\``)
      .setTimestamp();

    await message.channel.send({ embeds: [embed2] });
    return;
  }

  // Etapa 2: Arquivo principal
  if (ticket.etapa === 2) {
    ticket.mainFile = message.content.trim();
    ticket.etapa = 3;
    await message.delete().catch(() => {});

    const embed3 = new EmbedBuilder()
      .setColor(0x57F287)
      .setTitle('📦 Etapa 3/3')
      .setDescription(`**RAM:** \( {ticket.ram} MB\n**Principal:** \` \){ticket.mainFile}\`\n\nEnvie o arquivo **.zip** do seu bot.`)
      .setTimestamp();

    await message.channel.send({ embeds: [embed3] });
    return;
  }

  // Etapa 3: ZIP
  if (ticket.etapa === 3 && message.attachments.size > 0) {
    const attachment = message.attachments.first();
    if (!attachment.name.toLowerCase().endsWith('.zip')) {
      return message.reply('❌ Envie um arquivo **.zip** válido.');
    }

    await message.delete().catch(() => {});

    const processingEmbed = new EmbedBuilder()
      .setColor(0xF1C40F)
      .setTitle('⏳ Processando seu bot...')
      .setDescription('Baixando e analisando o arquivo...');

    await message.channel.send({ embeds: [processingEmbed] });

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
        return message.channel.send(`❌ Não encontrei o arquivo **${ticket.mainFile}** dentro do ZIP.`);
      }

      const botId = `bot-${Date.now().toString(36)}`;

      const successEmbed = new EmbedBuilder()
        .setColor(0x00FF00)
        .setTitle('✅ Bot Recebido e Analisado!')
        .setDescription('Seu bot foi processado com sucesso.')
        .addFields(
          { name: '🆔 ID', value: botId, inline: true },
          { name: '💾 RAM', value: `${ticket.ram} MB`, inline: true },
          { name: '📄 Principal', value: ticket.mainFile, inline: true }
        )
        .setTimestamp();

      await message.channel.send({ embeds: [successEmbed] });

      // Fecha o ticket automaticamente
      setTimeout(() => message.channel.delete().catch(() => {}), 12000);

    } catch (err) {
      console.error(err);
      message.channel.send('❌ Erro ao processar o arquivo ZIP. Tente novamente.');
    }

    ticketsEmProgresso.delete(message.channel.id);
  }
});

client.login(process.env.DISCORD_TOKEN).catch(err => {
  console.error('Erro ao fazer login:', err);
});
