const express = require('express');
const router = express.Router();
const mentor = require('../controllers/mentor.controller');
const { protect } = require('../middlewares/auth.middleware');

router.get('/', mentor.listMentors);
router.get('/sessions', protect, mentor.listSessions);
router.get('/sessions/:sessionId/messages', protect, mentor.getSessionMessages);
router.post('/sessions/:sessionId/messages', protect, mentor.sendSessionMessage);
router.get('/sessions/:sessionId/meeting', protect, mentor.getSessionMeeting);
router.get('/:mentorId/availability', mentor.getAvailability);
router.post('/:mentorId/sessions', protect, mentor.requestSession);
router.get('/me/profile', protect, mentor.myMentorProfile);
router.post('/me/profile', protect, mentor.submitProfile);
router.put('/sessions/:sessionId', protect, mentor.updateSession);
router.get('/:mentorId', mentor.getMentor);

module.exports = router;
