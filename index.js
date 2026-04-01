const { Client, GatewayIntentBits, SlashCommandBuilder, ChannelType, EmbedBuilder } = require('discord.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages
  ]
});

// Armazenamento temporário em memória (reinicia ao redeploy)
const hostingData = new Map();   // dados temporários do ticket
const userBots = new Map();      // bots "hospedados"

client.once('ready', () => {
  console.log(`✅ Bot online como ${client.user.tag}`);
});

client.on('ready', async () => {
  const commands = [
    new SlashCommandBuilder().setName('host').setDescription('Iniciar hospedagem de bot'),
    new SlashCommandBuilder().setName('meusbots').setDescription('Ver seus bots hospedados')
  ];

  await client.application.commands.set(commands);
  console.log('✅ Comandos registrados!');
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isCommand()) return;

  const { commandName, user, guild } = interaction;

  if (commandName === 'host') {
    const ticketChannel = await guild.channels.create({
      name: `📦-host-${user.username}`,
      type: ChannelType.GuildText,
      permissionOverwrites: [
        { id: guild.id, deny: ['ViewChannel'] },
        { id: user.id, allow: ['ViewChannel', 'SendMessages', 'AttachFiles', 'ReadMessageHistory'] }
      ]
    });

    await interaction.reply({ 
      content: `✅ Ticket criado! → ${ticketChannel}`, 
      ephemeral: true 
    });

    const embed1 = new EmbedBuilder()
      .setTitle('🚀 Hospedagem de Bot - Etapa 1/3')
      .setDescription('Qual a **RAM** que seu bot vai usar?\n\nExemplos:\n`128` ou `128MB`\n`256` ou `256MB`\n`512` ou `512MB`\n`1GB`')
      .setColor(0x5865F2)
      .setFooter({ text: 'Digite o valor (ex: 256 ou 1GB)' })
      .setTimestamp();

    await ticketChannel.send({ embeds: [embed1] });

    const filter = m => m.author.id === user.id;
    const ramCollector = ticketChannel.createMessageCollector({ filter, time: 300000, max: 1 });

    ramCollector.on('collect', async msg => {
      let input = msg.content.toUpperCase().trim().replace(/\s/g, '');
      let ram = 0;

      if (input.endsWith('GB')) ram = parseFloat(input) * 1024;
      else if (input.endsWith('MB')) ram = parseFloat(input);
      else ram = parseFloat(input);

      if (isNaN(ram) || ram < 64) {
        return msg.reply('❌ RAM inválida! Use 128, 256MB, 1GB, etc. (mínimo 64MB).');
      }

      await msg.delete().catch(() => {});

      hostingData.set(user.id, { ram: Math.floor(ram) });

      const embed2 = new EmbedBuilder()
        .setTitle('📁 Etapa 2/3 - Arquivo Principal')
        .setDescription(`**RAM definida:** ${Math.floor(ram)} MB\n\nQual é o **arquivo principal** do seu bot?\n\nEx: \`index.js\`, \`bot.js\`, \`main.py\``)
        .setColor(0x00BFFF)
        .setFooter({ text: 'Digite o nome exato do arquivo' })
        .setTimestamp();

      await ticketChannel.send({ embeds: [embed2] });

      const mainCollector = ticketChannel.createMessageCollector({ filter, time: 300000, max: 1 });

      mainCollector.on('collect', async m2 => {
        const mainFile = m2.content.trim();
        await m2.delete().catch(() => {});

        const data = hostingData.get(user.id) || {};
        data.mainFile = mainFile;
        hostingData.set(user.id, data);

        const embed3 = new EmbedBuilder()
          .setTitle('📦 Etapa 3/3 - Envie o ZIP')
          .setDescription(`**RAM:** \( {Math.floor(ram)} MB\n**Principal:** \` \){mainFile}\`\n\nEnvie agora o arquivo **.zip** do seu bot.`)
          .setColor(0x57F287)
          .setFooter({ text: 'Envie apenas 1 arquivo .zip' })
          .setTimestamp();

        await ticketChannel.send({ embeds: [embed3] });

        const zipCollector = ticketChannel.createMessageCollector({ 
          filter: m => m.author.id === user.id && m.attachments.size > 0,
          time: 300000,
          max: 1 
        });

        zipCollector.on('collect', async zipMsg => {
          await zipMsg.delete().catch(() => {});

          const botId = Date.now().toString(36).toUpperCase();

          // Salva o bot "hospedado"
          if (!userBots.has(user.id)) userBots.set(user.id, {});
          userBots.get(user.id)[botId] = {
            ram: Math.floor(ram),
            mainFile: mainFile,
            status: 'recebido',
            createdAt: new Date().toISOString()
          };

          const success = new EmbedBuilder()
            .setTitle('✅ Arquivo Recebido com Sucesso!')
            .setDescription('Seu bot foi processado.')
            .setColor(0x57F287)
            .addFields(
              { name: 'RAM', value: `${Math.floor(ram)} MB`, inline: true },
              { name: 'Principal', value: `\`${mainFile}\``, inline: true },
              { name: 'ID', value: `\`${botId}\``, inline: true }
            )
            .setTimestamp();

          await ticketChannel.send({ embeds: [success] });

          setTimeout(() => ticketChannel.delete().catch(() => {}), 10000);
        });
      });
    });
  }

  if (commandName === 'meusbots') {
    const bots = userBots.get(user.id) || {};
    if (Object.keys(bots).length === 0) {
      return interaction.reply({ content: 'Você ainda não hospedou nenhum bot.', ephemeral: true });
    }

    let desc = '';
    Object.entries(bots).forEach(([id, b]) => {
      desc += `**ID:** \`${id}\` | **RAM:** ${b.ram} MB\n`;
    });

    const embed = new EmbedBuilder()
      .setTitle('📋 Seus Bots Hospedados')
      .setDescription(desc)
      .setColor(0x5865F2)
      .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: true });
  }
});

client.login(process.env.TOKEN);
