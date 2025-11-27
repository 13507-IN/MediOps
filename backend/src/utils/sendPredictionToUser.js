import User from "../models/User.js";
import bot from "../config/telegramBot.js"; 

// ⬆ You are correctly using the same bot instance created in your file.

export const sendPredictionToUser = async (userId, prediction) => {
  try {
    console.log(`[Telegram] Looking up user with ID: ${userId}`);

    // 1️⃣ Find user in your main User database
    const user = await User.findById(userId);

    if (!user) {
      console.log(`[Telegram] Error: No user found with ID: ${userId}`);
      return;
    }

    // 2️⃣ Check if this user has linked Telegram
    if (!user.telegramChatId) {
      console.log(
        `[Telegram] User ${user.email} has NOT linked Telegram (missing telegramChatId)`
      );
      return;
    }

    console.log(`[Telegram] Sending message to chat ID: ${user.telegramChatId}`);

    // 3️⃣ Create formatted prediction message (escape special Markdown characters)
    const escapeMarkdown = (text) => {
      if (!text) return 'N/A';
      return String(text)
        .replace(/\_/g, '\\_')
        .replace(/\*/g, '\\*')
        .replace(/\[/g, '\\[')
        .replace(/\]/g, '\\]')
        .replace(/\(/g, '\\(')
        .replace(/\)/g, '\\)')
        .replace(/\~/g, '\\~')
        .replace(/\`/g, '\\`')
        .replace(/\>/g, '\\>')
        .replace(/\#/g, '\\#')
        .replace(/\+/g, '\\+')
        .replace(/\-/g, '\\-')
        .replace(/\=/g, '\\=')
        .replace(/\|/g, '\\|')
        .replace(/\{/g, '\\{')
        .replace(/\}/g, '\\}')
        .replace(/\./g, '\\.')
        .replace(/\!/g, '\\!');
    };

    const message = `
🏥 *MediOps Prediction Alert*

━━━━━━━━━━━━━━━━━━━━━━━━━
📍 *Region:* ${escapeMarkdown(prediction.region)}
📅 *Date:* ${escapeMarkdown(new Date(prediction.date).toDateString())}

⚠️ *Surge Probability:* ${prediction.surgeProbability}%
👥 *Estimated Patients:* ${prediction.estimatedPatientCount}

📊 *Top Factors:*
${prediction.topFactors?.map(f => `  • ${escapeMarkdown(f.feature)}: ${f.impact}`).join("\n") || '  • No factors available'}

👨‍⚕️ *Staff Advice:*
  • Doctors: ${prediction.staffAdvice?.doctors || 'N/A'}
  • Nurses: ${prediction.staffAdvice?.nurses || 'N/A'}
  • Support Staff: ${prediction.staffAdvice?.supportStaff || 'N/A'}

💊 *Supply Advice:*
  • Oxygen: ${prediction.supplyAdvice?.oxygen || 'N/A'}
  • PPE: ${prediction.supplyAdvice?.ppe || 'N/A'}

🦠 *Active Pandemics:*
${prediction.activePandemics?.map(
  p => `  • ${escapeMarkdown(p.diseaseName)} \\- ${p.activeCases} cases`
).join("\n") || '  • No active pandemics'}

🌫️ *AQI Impact:*
${escapeMarkdown(prediction.aqiImpact) || 'N/A'}

🌤️ *Weather Impact:*
${escapeMarkdown(prediction.weatherImpact) || 'N/A'}
━━━━━━━━━━━━━━━━━━━━━━━━━
`;

    // 4️⃣ Send message to user using your bot
    const result = await bot.sendMessage(user.telegramChatId, message, {
      parse_mode: "Markdown"
    });

    console.log("[Telegram] Message sent successfully!");
    return result;

  } catch (error) {
    console.error("[Telegram] Error sending prediction:", error.message);
    console.error("Full error:", error);
    throw error;
  }
};
