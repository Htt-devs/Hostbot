const { Client, GatewayIntentBits, SlashCommandBuilder, ChannelType, EmbedBuilder } = require('discord.js');
const db = require('quick.db');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages
  ]
});

client.once('ready', () => {
  console.log(`✅ Bot online como ${client.user.tag}`);
});

client.on('ready', async () => {
  const commands = [
    new SlashCommandBuilder().setName('host').setDescription('Iniciar hospedagem'),
    new SlashCommandBuilder().setName('meusbots').setDescription('Ver bots hospedados'),
    new SlashCommandBuilder().setName('parar').setDescription('Parar um bot'),
    new SlashCommandBuilder().setName('reiniciar').setDescription('Reiniciar um bot')
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

    await interaction.reply({ content: `✅ Ticket criado! → ${ticketChannel}`, ephemeral: true });

    const embed1 = new EmbedBuilder()
      .setTitle('🚀 Hospedagem de Bot')
      .setDescription('**Etapa 1/3**\n\nQual a quantidade de **RAM** (em MB)?\n\n`128` → Pequeno\n`256` → Médio\n`512` → Grande')
      .setColor(0x5865F2)
      .setFooter({ text: 'Digite apenas o número' })
      .setTimestamp();

    await ticketChannel.send({ embeds: [embed1] });

    const filter = m => m.author.id === user.id;
    const ramCollector = ticketChannel.createMessageCollector({ filter, time: 300000, max: 1 });

    ramCollector.on('collect', async msg => {
      const ram = parseInt(msg.content);
      if (isNaN(ram) || ram < 64) {
        return msg.reply('❌ RAM inválida! Use número ≥ 64.');
      }

      await msg.delete().catch(() => {});

      db.set(`hosting.${user.id}.ram`, ram);

      const embed2 = new EmbedBuilder()
        .setTitle('📁 Etapa 2/3')
        .setDescription(`**RAM:** ${ram} MB\n\nQual é o **arquivo principal**? (ex: index.js)`)
        .setColor(0x00BFFF)
        .setFooter({ text: 'Digite o nome exato' })
        .setTimestamp();

      await ticketChannel.send({ embeds: [embed2] });

      const mainCollector = ticketChannel.createMessageCollector({ filter, time: 300000, max: 1 });

      mainCollector.on('collect', async m2 => {
        const mainFile = m2.content.trim();
        await m2.delete().catch(() => {});

        db.set(`hosting.${user.id}.mainFile`, mainFile);

        const embed3 = new EmbedBuilder()
          .setTitle('📦 Etapa 3/3')
          .setDescription(`**RAM:** \( {ram} MB\n**Principal:** \` \){mainFile}\`\n\nEnvie o arquivo **.zip** do seu bot.`)
          .setColor(0x57F287)
          .setFooter({ text: 'Envie o .zip agora' })
          .setTimestamp();

        await ticketChannel.send({ embeds: [embed3] });

        // Coletor simples do ZIP (sem análise por enquanto)
        const zipCollector = ticketChannel.createMessageCollector({ 
          filter: m => m.author.id === user.id && m.attachments.size > 0,
          time: 300000,
          max: 1 
        });

        zipCollector.on('collect', async zipMsg => {
          await zipMsg.delete().catch(() => {});

          const botId = Date.now().toString(36).toUpperCase();

          db.set(`bots.\( {user.id}. \){botId}`, {
            ram,
            mainFile,
            status: 'recebido',
            createdAt: new Date().toISOString()
          });

          const success = new EmbedBuilder()
            .setTitle('✅ Arquivo Recebido!')
            .setDescription('ZIP recebido com sucesso.')
            .setColor(0x57F287)
            .addFields(
              { name: 'RAM', value: `${ram} MB`, inline: true },
              { name: 'Principal', value: `\`${mainFile}\``, inline: true }
            )
            .setTimestamp();

          await ticketChannel.send({ embeds: [success] });

          setTimeout(() => ticketChannel.delete().catch(() => {}), 8000);
        });
      });
    });
  }

  if (commandName === 'meusbots') {
    const userBots = db.get(`bots.${user.id}`) || {};
    if (Object.keys(userBots).length === 0) {
      return interaction.reply({ content: 'Você ainda não hospedou nenhum bot.', ephemeral: true });
    }

    let desc = '';
    Object.entries(userBots).forEach(([id, b]) => {
      desc += `**ID:** \`${id}\` | **RAM:** ${b.ram}MB\n`;
    });

    const embed = new EmbedBuilder()
      .setTitle('📋 Seus Bots Hospedados')
      .setDescription(desc)
      .setColor(0x5865F2);

    await interaction.reply({ embeds: [embed], ephemeral: true });
  }

  if (commandName === 'parar' || commandName === 'reiniciar') {
    await interaction.reply({ content: '🔧 Comando em desenvolvimento.', ephemeral: true });
  }
});

client.login(process.env.TOKEN);
