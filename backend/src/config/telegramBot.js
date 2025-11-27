import TelegramBot from "node-telegram-bot-api";
import dotenv from "dotenv";
import User from "../models/User.js";

dotenv.config();

// Singleton instance
let botInstance = null;

/**
 * Create / get Telegram bot (WEBHOOK MODE)
 */
export const getBotInstance = () => {
  if (!botInstance) {
    botInstance = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, {
      webHook: true
    });

    // Message Handler
    botInstance.on("message", async (msg) => {
      try {
        const chatId = msg.chat.id;
        const text = (msg.text || "").trim();

        if (text === "/start") {
          return botInstance.sendMessage(
            chatId,
            " *MediOps Account Linking*\n\nPlease send your registered email address to link your account.",
            { parse_mode: "Markdown" }
          );
        }

        if (text.includes("@")) {
          // Validate email format
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          if (!emailRegex.test(text)) {
            return botInstance.sendMessage(
              chatId,
              " *Invalid Email Format*\nPlease enter a valid email address.",
              { parse_mode: "Markdown" }
            );
          }

          // Look up user
          const user = await User.findOne({ email: text.toLowerCase().trim() });
          if (!user) {
            return botInstance.sendMessage(
              chatId,
              " *Account Not Found*\nCheck the email or register first.",
              { parse_mode: "Markdown" }
            );
          }

          // Check if chatId already linked
          const existingUser = await User.findOne({
            telegramChatId: String(chatId),
            _id: { $ne: user._id },
          });

          if (existingUser) {
            return botInstance.sendMessage(
              chatId,
              ` *Already Linked*\nThis Telegram is already linked to ${existingUser.email}.`,
              { parse_mode: "Markdown" }
            );
          }

          // Link
          user.telegramChatId = String(chatId);
          await user.save();

          return botInstance.sendMessage(
            chatId,
            ` *Success!*\nYour Telegram is now linked to ${user.email}.`,
            { parse_mode: "Markdown" }
          );
        }

        // Default response
        return botInstance.sendMessage(
          chatId,
          " Please send your registered email address or type /start",
          { parse_mode: "Markdown" }
        );

      } catch (error) {
        console.error("Error in bot handler:", error);
        botInstance.sendMessage(
          msg.chat.id,
          " *Error*\nSomething went wrong.",
          { parse_mode: "Markdown" }
        );
      }
    });
  }

  return botInstance;
};

const bot = getBotInstance();

export const sendMessage = async (chatId, text, options = {}) => {
  return bot.sendMessage(chatId, text, {
    parse_mode: "Markdown",
    ...options,
  });
};

export default bot;
