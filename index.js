const { Client, GatewayIntentBits, SlashCommandBuilder, ChannelType, EmbedBuilder } = require('discord.js');
const AdmZip = require('adm-zip');
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

// Registrar comandos
client.on('ready', async () => {
  const commands = [
    new SlashCommandBuilder().setName('host').setDescription('Iniciar processo de hospedagem'),
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

  // ====================== /HOST ======================
  if (commandName === 'host') {

    // Cria o ticket direto no topo (sem categoria)
    const ticketChannel = await guild.channels.create({
      name: `📦-host-${user.username}`,
      type: ChannelType.GuildText,
      permissionOverwrites: [
        { 
          id: guild.id, 
          deny: ['ViewChannel'] 
        },
        { 
          id: user.id, 
          allow: ['ViewChannel', 'SendMessages', 'AttachFiles', 'ReadMessageHistory'] 
        }
      ]
    });

    await interaction.reply({ 
      content: `✅ Ticket de hospedagem criado! → ${ticketChannel}`, 
      ephemeral: true 
    });

    // Embed 1 - RAM (bem bonito)
    const embed1 = new EmbedBuilder()
      .setTitle('🚀 Hospedagem de Bot')
      .setDescription('**Etapa 1/3**\n\nQual a quantidade de **RAM** que seu bot vai usar? (em MB)\n\n**Recomendações:**\n`128` → Bots pequenos\n`256` → Uso médio (recomendado)\n`512` → Bots maiores')
      .setColor(0x5865F2)
      .setFooter({ text: 'Digite apenas o número (ex: 256)' })
      .setTimestamp();

    await ticketChannel.send({ embeds: [embed1] });

    const filter = m => m.author.id === user.id;

    // Coletor RAM
    const ramCollector = ticketChannel.createMessageCollector({ filter, time: 300000, max: 1 });

    ramCollector.on('collect', async msg => {
      const ram = parseInt(msg.content);
      if (isNaN(ram) || ram < 64) {
        return msg.reply('❌ RAM inválida! Use um número ≥ 64.').then(m => setTimeout(() => m.delete().catch(() => {}), 6000));
      }

      await msg.delete().catch(() => {});

      db.set(`hosting.${user.id}.ram`, ram);

      // Embed 2 - Arquivo Principal
      const embed2 = new EmbedBuilder()
        .setTitle('📁 Etapa 2/3 - Arquivo Principal')
        .setDescription(`**RAM definida:** ${ram} MB\n\nQual é o **arquivo principal** do seu bot?\n\nExemplos: \`index.js\`, \`bot.js\`, \`main.js\``)
        .setColor(0x00BFFF)
        .setFooter({ text: 'Digite o nome exato do arquivo' })
        .setTimestamp();

      await ticketChannel.send({ embeds: [embed2] });

      const mainCollector = ticketChannel.createMessageCollector({ filter, time: 300000, max: 1 });

      mainCollector.on('collect', async m2 => {
        const mainFile = m2.content.trim();
        await m2.delete().catch(() => {});

        db.set(`hosting.${user.id}.mainFile`, mainFile);

        // Embed 3 - Enviar ZIP
        const embed3 = new EmbedBuilder()
          .setTitle('📦 Etapa 3/3 - Envie o ZIP')
          .setDescription(`**RAM:** \( {ram} MB\n**Principal:** \` \){mainFile}\`\n\nEnvie agora o arquivo **.zip** completo do seu bot.`)
          .setColor(0x57F287)
          .setFooter({ text: 'Apenas 1 arquivo .zip' })
          .setTimestamp();

        await ticketChannel.send({ embeds: [embed3] });

        // Coletor do ZIP
        const zipCollector = ticketChannel.createMessageCollector({ 
          filter: m => m.author.id === user.id && m.attachments.size > 0,
          time: 300000,
          max: 1 
        });

        zipCollector.on('collect', async zipMsg => {
          await zipMsg.delete().catch(() => {});

          const attachment = zipMsg.attachments.first();
          if (!attachment.name.toLowerCase().endsWith('.zip')) {
            return ticketChannel.send('❌ Precisa ser um arquivo **.zip**!');
          }

          try {
            const zipBuffer = await attachment.fetch();
            const zip = new AdmZip(zipBuffer);
            const entries = zip.getEntries();

            const mainExists = entries.some(entry => 
              entry.entryName === mainFile || 
              entry.entryName.endsWith('/' + mainFile) ||
              entry.entryName.endsWith('\\' + mainFile)
            );

            if (!mainExists) {
              return ticketChannel.send(`❌ Arquivo **${mainFile}** não encontrado no ZIP.`);
            }

            // Salva o bot hospedado
            const botId = Date.now().toString(36).toUpperCase();
            db.set(`bots.\( {user.id}. \){botId}`, {
              ram: ram,
              mainFile: mainFile,
              status: 'hospedado',
              createdAt: new Date().toISOString()
            });

            // Embed de Sucesso
            const successEmbed = new EmbedBuilder()
              .setTitle('✅ Bot Hospedado com Sucesso!')
              .setDescription('O arquivo foi analisado corretamente.')
              .setColor(0x57F287)
              .addFields(
                { name: 'RAM', value: `${ram} MB`, inline: true },
                { name: 'Arquivo Principal', value: `\`${mainFile}\``, inline: true },
                { name: 'ID do Bot', value: `\`${botId}\``, inline: true }
              )
              .setFooter({ text: `Ticket será fechado automaticamente` })
              .setTimestamp();

            await ticketChannel.send({ embeds: [successEmbed] });

            // Fecha o ticket após 12 segundos
            setTimeout(() => ticketChannel.delete().catch(() => {}), 12000);

          } catch (err) {
            console.error(err);
            ticketChannel.send('❌ Erro ao processar o ZIP. Tente novamente.');
          }
        });

        zipCollector.on('end', () => {
          if (zipCollector.collected.size === 0) {
            ticketChannel.send('⏰ Tempo esgotado.').then(() => setTimeout(() => ticketChannel.delete().catch(() => {}), 5000));
          }
        });
      });
    });
  }

  // ====================== /MEUSBOTS ======================
  if (commandName === 'meusbots') {
    const userBots = db.get(`bots.${user.id}`) || {};
    if (Object.keys(userBots).length === 0) {
      return interaction.reply({ content: 'Você ainda não hospedou nenhum bot.', ephemeral: true });
    }

    let desc = '';
    Object.entries(userBots).forEach(([id, b]) => {
      desc += `**ID:** \`${id}\` | **RAM:** ${b.ram}MB | **Status:** ${b.status}\n`;
    });

    const embed = new EmbedBuilder()
      .setTitle('📋 Seus Bots Hospedados')
      .setDescription(desc)
      .setColor(0x5865F2)
      .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: true });
  }

  if (commandName === 'parar' || commandName === 'reiniciar') {
    await interaction.reply({ content: '🔧 Comando em desenvolvimento.', ephemeral: true });
  }
});

client.login(process.env.TOKEN);
