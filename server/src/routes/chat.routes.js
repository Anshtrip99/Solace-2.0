/**
 * Chat Routes
 * Handles chat messages and conversation history
 */

const express = require('express');
const router = express.Router();
const {
  sendMessage,
  getHistory,
  getChat,
  getMoodHistory,
  startNewChat
} = require('../controllers/chat.controller');
const { protect, requireRole } = require('../middlewares/auth.middleware');
const userOnly = [protect, requireRole('user')];

/**
 * @route   POST /api/chat/message
 * @desc    Send a message and get AI response
 * @access  Private
 */
router.post('/message', ...userOnly, sendMessage);

/**
 * @route   GET /api/chat/history
 * @desc    Get user's chat history
 * @access  Private
 */
router.get('/history', ...userOnly, getHistory);

/**
 * @route   GET /api/chat/mood-history
 * @desc    Get user's mood history and analytics
 * @access  Private
 */
router.get('/mood-history', ...userOnly, getMoodHistory);

/**
 * @route   GET /api/chat/:chatId
 * @desc    Get a specific chat by ID
 * @access  Private
 */
router.get('/:chatId', ...userOnly, getChat);

/**
 * @route   POST /api/chat/new
 * @desc    Start a new chat session
 * @access  Private
 */
router.post('/new', ...userOnly, startNewChat);

module.exports = router;
