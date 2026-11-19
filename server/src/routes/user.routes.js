/**
 * User Routes
 * Handles user profile and settings
 */

const express = require('express');
const router = express.Router();
const {
  getProfile,
  updateProfile,
  changePassword,
  deleteAccount
} = require('../controllers/user.controller');
const { protect } = require('../middlewares/auth.middleware');
const { saveEmergencyPreferences } = require('../controllers/mentor.controller');

/**
 * @route   GET /api/user/profile
 * @desc    Get user profile
 * @access  Private
 */
router.get('/profile', protect, getProfile);

/**
 * @route   PUT /api/user/profile
 * @desc    Update user profile
 * @access  Private
 */
router.put('/profile', protect, updateProfile);

/**
 * @route   PUT /api/user/password
 * @desc    Change user password
 * @access  Private
 */
router.put('/password', protect, changePassword);
router.put('/emergency-preferences', protect, saveEmergencyPreferences);

/**
 * @route   DELETE /api/user/account
 * @desc    Delete user account (soft delete)
 * @access  Private
 */
router.delete('/account', protect, deleteAccount);

module.exports = router;
