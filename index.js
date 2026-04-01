const { Client, GatewayIntentBits, SlashCommandBuilder, ChannelType, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const AdmZip = require('adm-zip');
const db = require('quick.db');
const fs = require('fs');
const path = require('path');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages
  ]
});

// Configurações
const TICKET_CATEGORY_ID = "SEU_ID_DA_CATEGORIA_AQUI"; // Crie uma categoria no servidor e coloque o ID aqui
const STAFF_ROLE_ID = "SEU_ID_ROLE_STAFF_AQUI"; // Opcional

client.once('ready', () => {
  console.log(`✅ Bot online como ${client.user.tag}`);
});

// Registrar comandos (rode uma vez ou use deploy-commands)
client.on('ready', async () => {
  const commands = [
    new SlashCommandBuilder().setName('host').setDescription('Iniciar processo de hospedagem'),
    new SlashCommandBuilder().setName('meusbots').setDescription('Ver todos os bots que você hospedou'),
    new SlashCommandBuilder().setName('parar').setDescription('Parar um bot hospedado'),
    new SlashCommandBuilder().setName('reiniciar').setDescription('Reiniciar um bot hospedado')
  ];

  await client.application.commands.set(commands);
  console.log('Comandos registrados!');
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isCommand()) return;

  const { commandName, user } = interaction;

  if (commandName === 'host') {
    // Cria ticket
    const ticketChannel = await interaction.guild.channels.create({
      name: `host-${user.username}`,
      type: ChannelType.GuildText,
      parent: TICKET_CATEGORY_ID,
      permissionOverwrites: [
        { id: interaction.guild.id, deny: ['ViewChannel'] },
        { id: user.id, allow: ['ViewChannel', 'SendMessages', 'AttachFiles'] },
        // { id: STAFF_ROLE_ID, allow: ['ViewChannel'] } // descomente se quiser staff ver
      ]
    });

    await interaction.reply({ content: `✅ Ticket criado! Vá para ${ticketChannel}`, ephemeral: true });

    const embed = new EmbedBuilder()
      .setTitle('🚀 Processo de Hospedagem')
      .setDescription('Vamos configurar seu bot.\n\n**Etapa 1/3**: Qual a quantidade de RAM que seu bot vai usar? (em MB)\nExemplos: 128, 256, 512')
      .setColor('Blue');

    await ticketChannel.send({ embeds: [embed] });

    // Coleta RAM
    const ramFilter = m => m.author.id === user.id;
    const ramCollector = ticketChannel.createMessageCollector({ filter: ramFilter, time: 300000, max: 1 });

    ramCollector.on('collect', async msg => {
      const ram = parseInt(msg.content);
      if (isNaN(ram) || ram < 64) {
        return msg.reply('❌ RAM inválida. Use um número maior que 64.');
      }

      await msg.delete(); // apaga mensagem do usuário

      db.set(`hosting.${user.id}.ram`, ram);

      const embed2 = new EmbedBuilder()
        .setTitle('Etapa 2/3')
        .setDescription(`RAM definida: **${ram} MB**\n\n**Qual é o arquivo principal?** (ex: `index.js`, `bot.js`, `main.py` etc.)`)
        .setColor('Blue');

      await ticketChannel.send({ embeds: [embed2] });

      // Coleta arquivo principal
      const mainCollector = ticketChannel.createMessageCollector({ filter: ramFilter, time: 300000, max: 1 });

      mainCollector.on('collect', async m2 => {
        const mainFile = m2.content.trim();
        await m2.delete();

        db.set(`hosting.${user.id}.mainFile`, mainFile);

        const embed3 = new EmbedBuilder()
          .setTitle('Etapa 3/3 - Envie o ZIP')
          .setDescription(`Arquivo principal definido: **${mainFile}**\n\nAgora envie o arquivo **.zip** contendo todo o seu bot.`)
          .setColor('Blue');

        await ticketChannel.send({ embeds: [embed3] });

        // Coleta ZIP
        const zipCollector = ticketChannel.createMessageCollector({ 
          filter: m => m.author.id === user.id && m.attachments.size > 0,
          time: 300000,
          max: 1
        });

        zipCollector.on('collect', async zipMsg => {
          await zipMsg.delete(); // apaga mensagem com o zip

          const attachment = zipMsg.attachments.first();
          if (!attachment.name.endsWith('.zip')) {
            return ticketChannel.send('❌ O arquivo deve ser um .zip');
          }

          try {
            const zipBuffer = await attachment.fetch();
            const zip = new AdmZip(zipBuffer);
            const zipEntries = zip.getEntries();

            const mainExists = zipEntries.some(entry => entry.entryName === mainFile || entry.entryName.endsWith('/' + mainFile));

            if (!mainExists) {
              return ticketChannel.send(`❌ Arquivo principal **${mainFile}** não encontrado no ZIP!`);
            }

            // Aqui você pode adicionar mais verificações (ex: procurar token no código)

            // Salva informações do bot hospedado
            const botId = Date.now().toString();
            db.set(`bots.\( {user.id}. \){botId}`, {
              name: `Bot de ${user.username}`,
              ram: ram,
              mainFile: mainFile,
              status: 'hospedado',
              createdAt: new Date()
            });

            const successEmbed = new EmbedBuilder()
              .setTitle('✅ Bot Hospedado com Sucesso!')
              .setDescription(`Seu bot foi processado corretamente.\nRAM: ${ram} MB\nArquivo principal: ${mainFile}\n\nID do bot: ${botId}`)
              .setColor('Green');

            await ticketChannel.send({ embeds: [successEmbed] });

            // Fecha ticket após 10 segundos
            setTimeout(() => ticketChannel.delete().catch(() => {}), 10000);

          } catch (err) {
            console.error(err);
            ticketChannel.send('❌ Erro ao processar o ZIP. Tente novamente.');
          }
        });

        zipCollector.on('end', collected => {
          if (collected.size === 0) ticketChannel.send('⏰ Tempo esgotado para enviar o ZIP.').then(() => setTimeout(() => ticketChannel.delete().catch(() => {}), 5000));
        });
      });
    });
  }

  // Comando /meusbots (lista com paginação simples)
  if (commandName === 'meusbots') {
    const userBots = db.get(`bots.${user.id}`) || {};
    if (Object.keys(userBots).length === 0) {
      return interaction.reply({ content: 'Você ainda não hospedou nenhum bot.', ephemeral: true });
    }

    let description = '';
    Object.entries(userBots).forEach(([id, bot]) => {
      description += `**ID:** ${id} | RAM: ${bot.ram}MB | Status: ${bot.status}\n`;
    });

    const embed = new EmbedBuilder()
      .setTitle('Seus Bots Hospedados')
      .setDescription(description)
      .setColor('Blue');

    await interaction.reply({ embeds: [embed], ephemeral: true });
  }

  // /parar e /reiniciar (por enquanto só placeholder)
  if (commandName === 'parar' || commandName === 'reiniciar') {
    await interaction.reply({ content: '🔧 Comando em desenvolvimento. Use `/meusbots` para ver seus bots.', ephemeral: true });
  }
});

client.login(process.env.TOKEN);
