require('dotenv').config();

const crypto = require('crypto');
const mongoose = require('mongoose');
const User = require('../src/models/User');
const MentorProfile = require('../src/models/MentorProfile');
const MentorSession = require('../src/models/MentorSession');
const MentorMessage = require('../src/models/MentorMessage');
const Chat = require('../src/models/Chat');
const MoodLog = require('../src/models/MoodLog');

const DEMO_PASSWORD = 'SolaceDemo!2026';
const DAY_SLOTS = [0, 1, 2, 3, 4, 5, 6].map(day => ({ day, start: '09:00', end: '19:00' }));

const demoAccounts = [
  { key: 'user', email: 'demo.user@solace.local', name: 'Aarav Shah', role: 'user' },
  { key: 'maya', email: 'demo.mentor.maya@solace.local', name: 'Maya Kapoor', role: 'mentor' },
  { key: 'rohan', email: 'demo.mentor.rohan@solace.local', name: 'Rohan Mehta', role: 'mentor' },
  { key: 'leela', email: 'demo.mentor.leela@solace.local', name: 'Leela Nair', role: 'mentor' }
];

const mentorDetails = {
  maya: {
    phone: '+91 90000 00021', background: 'Final-year literature student who has volunteered as a peer mentor in a university student support group.',
    expertise: ['Academic stress', 'Anxiety and emotional wellbeing', 'Personal development'],
    mentorType: 'peer_wellbeing', qualifications: [], experienceYears: 2,
    languages: ['English', 'Hindi'], introduction: 'A calm, practical peer mentor for busy weeks and big transitions.',
    bio: 'I know how quickly coursework, presentations, and expectations can pile up. I offer a steady space to sort through what feels urgent and choose one manageable next step.',
    approach: 'I listen first, reflect back what I hear, and help break a large worry into smaller choices. I am a peer mentor, not a therapist or medical professional.',
    sessionDuration: 30
  },
  rohan: {
    phone: '+91 90000 00022', background: 'Recent engineering graduate who has supported classmates with placement preparation and early-career decisions.',
    expertise: ['Career and placement stress', 'Personal development', 'Academic stress'],
    mentorType: 'peer_wellbeing', qualifications: [], experienceYears: 3,
    languages: ['English', 'Hindi', 'Gujarati'], introduction: 'A friendly sounding board for placement season and career decisions.',
    bio: 'The final stretch of college can bring a lot of uncertainty. I enjoy helping people organize their options, prepare for interviews, and make space for rest alongside the search.',
    approach: 'We can clarify what is in your control, practice a small part of a difficult conversation, or build a realistic plan for the week. I offer peer guidance, not professional mental-health care.',
    sessionDuration: 45
  },
  leela: {
    phone: '+91 90000 00023', background: 'Community volunteer and postgraduate student with experience facilitating small peer-support circles.',
    expertise: ['Relationship challenges', 'Family-related concerns', 'Anxiety and emotional wellbeing'],
    mentorType: 'peer_wellbeing', qualifications: [], experienceYears: 4,
    languages: ['English', 'Malayalam', 'Tamil'], introduction: 'A thoughtful listener for relationship changes and family conversations.',
    bio: 'I value conversations where people can take their time and speak without being rushed. I have volunteered in peer-support spaces and understand that family and relationship situations rarely have simple answers.',
    approach: 'I make room for different feelings, ask what kind of support would be useful, and avoid telling someone what they should do. I am a peer mentor, not a therapist or clinician.',
    sessionDuration: 30
  }
};

const sessionDefinitions = now => {
  const dateAt = (dayOffset, hour, minute = 0) => {
    const date = new Date(now);
    date.setUTCHours(0, 0, 0, 0);
    date.setUTCDate(date.getUTCDate() + dayOffset);
    date.setUTCHours(hour, minute, 0, 0);
    return date;
  };
  return [
    { key: 'maya-current-accepted', mentor: 'maya', status: 'accepted', startsAt: dateAt(1, 10), note: 'I have a short class presentation tomorrow and keep getting stuck on the opening.', summary: '' },
    { key: 'rohan-pending-request', mentor: 'rohan', status: 'pending', startsAt: dateAt(2, 15), note: 'Placement season has started and I would like help sorting out what to focus on this week.', summary: '' },
    { key: 'maya-completed', mentor: 'maya', status: 'completed', startsAt: dateAt(-3, 11), note: 'I want to talk through how to make my study plan less all-or-nothing.', summary: 'We chose three short study blocks, added a proper lunch break, and agreed that one missed block does not mean the whole plan has failed.' },
    { key: 'leela-cancelled', mentor: 'leela', status: 'cancelled', startsAt: dateAt(2, 16), note: 'I would like a little space to talk about setting boundaries at home.', summary: '' },
    { key: 'rohan-rejected', mentor: 'rohan', status: 'rejected', startsAt: dateAt(-6, 14), note: 'Could use a practice conversation for an upcoming interview.', summary: '' },
    { key: 'leela-future-accepted', mentor: 'leela', status: 'accepted', startsAt: dateAt(3, 16), note: 'I have been finding it hard to start a conversation with my family about moving cities.', summary: '' }
  ].map(session => {
    const duration = { maya: 30, rohan: 45, leela: 30 }[session.mentor];
    const createdAtByKey = {
      'maya-current-accepted': new Date(now.getTime() - 86400000),
      'rohan-pending-request': new Date(now.getTime() - 60 * 60000),
      'maya-completed': new Date(session.startsAt.getTime() - 8 * 3600000),
      'leela-cancelled': new Date(now.getTime() - 2 * 86400000),
      'rohan-rejected': new Date(session.startsAt.getTime() - 4 * 86400000),
      'leela-future-accepted': new Date(now.getTime() - 2 * 86400000)
    };
    return { ...session, createdAt: createdAtByKey[session.key], endsAt: new Date(session.startsAt.getTime() + duration * 60000) };
  });
};

const conversation = (sessionId, user, mentor, start, lines) => lines.map(([sender, content], index) => ({
  session: sessionId,
  sender: sender === 'user' ? user._id : mentor._id,
  content,
  createdAt: new Date(start.getTime() + index * 75000),
  updatedAt: new Date(start.getTime() + index * 75000)
}));

// Fictional, presentation-only AI conversations spanning the last 30 days.
// Entries use the same persisted fields as real chats and are explicitly marked as demo data.
const aiTimeline = [
  { day: 29, title: 'Settling into a new semester', topic: 'Academic stress', mood: 'anxious', confidence: .82, strategy: 'empathetic_support', focus: 'uncertainty about a new routine', categories: ['stress_management', 'grounding'], messages: [
    ['user', 'The new semester started this week and I already feel behind, even though classes only began on Monday.'],
    ['assistant', 'A new routine can feel demanding before you have had a chance to settle into it. Being uneasy this early does not mean you are failing. What part of the week feels least predictable?'],
    ['user', 'I do not know how much time assignments will take yet, so I keep planning every evening and then worrying the plan is wrong.'],
    ['assistant', 'It may help to treat this first week as information gathering instead of a test. You could leave one open block each evening and adjust once you see how long the work actually takes.'],
    ['user', 'Leaving space sounds better than scheduling every minute. I can try that for a few days.'],
    ['assistant', 'That is a practical experiment. After a few days, notice whether the open block reduced pressure or simply needs a clearer purpose.']
  ] },
  { day: 27, title: 'Worry before a group meeting', topic: 'Communication', mood: 'stressed', confidence: .79, strategy: 'coaching', focus: 'preparing one clear contribution', categories: ['communication', 'stress_management'], messages: [
    ['user', 'I have a group meeting tomorrow and keep thinking I will have nothing useful to say.'],
    ['assistant', 'That sounds like pressure to perform before the meeting has even started. Would preparing one question or observation feel more manageable than trying to plan the whole discussion?'],
    ['user', 'One question would be doable. I am not sure how to make it sound confident.'],
    ['assistant', 'You could write it in your own words and begin with “I was wondering whether…” Confidence can come from being clear, not from sounding perfectly certain.'],
    ['user', 'I wrote down a question about how we are splitting the research.'],
    ['assistant', 'That gives the group something concrete to work with. Keep the note nearby and let the conversation do the rest.']
  ] },
  { day: 25, title: 'A difficult comparison', topic: 'Self-esteem', mood: 'sad', confidence: .77, strategy: 'reflective', focus: 'comparison with peers', categories: ['self_compassion', 'emotional_wellbeing'], messages: [
    ['user', 'Everyone around me seems to have internships figured out. I am trying not to compare, but it makes me feel small.'],
    ['assistant', 'It can hurt to see other people’s visible milestones while your own path feels uncertain. Their updates do not show every doubt or delay behind the scenes.'],
    ['user', 'I know that logically, but I still feel behind.'],
    ['assistant', 'Both can be true: you can understand the comparison is incomplete and still feel its weight. What is one step that belongs to your own path this week?'],
    ['user', 'I could update my resume and ask one senior about their experience.'],
    ['assistant', 'Those are specific and within reach. You do not have to solve the whole career question to take either step.']
  ] },
  { day: 23, title: 'Making a realistic study plan', topic: 'Planning', mood: 'overwhelmed', confidence: .84, strategy: 'coaching', focus: 'reducing an overloaded task list', categories: ['goal_setting', 'stress_management'], messages: [
    ['user', 'My to-do list has twelve things on it and I keep switching tasks instead of starting.'],
    ['assistant', 'A long list can make every task feel equally urgent. Let’s narrow the view: what has a real deadline in the next two days?'],
    ['user', 'A lab report and reading for a quiz. The rest can wait.'],
    ['assistant', 'That gives you a useful first filter. You could work on the report for 25 minutes, take a short break, and then decide whether to continue or switch to quiz reading.'],
    ['user', 'I will try the report first and leave the other list closed for a while.'],
    ['assistant', 'A small boundary around your attention may make starting easier. The rest of the list will still be there when you are ready to review it.']
  ] },
  { day: 21, title: 'A calmer morning routine', topic: 'Daily wellbeing', mood: 'calm', confidence: .75, strategy: 'skill_building', focus: 'building a repeatable morning cue', categories: ['self_care', 'routine_building'], messages: [
    ['user', 'I left my phone across the room this morning and had breakfast before checking messages. It felt quieter.'],
    ['assistant', 'That sounds like a small change that gave your morning more breathing room. What part of it would you most like to keep?'],
    ['user', 'Not seeing notifications immediately. I was less rushed getting ready.'],
    ['assistant', 'You might keep the phone outside reach for the first ten minutes and see if that remains helpful on busier mornings too.'],
    ['user', 'Ten minutes feels realistic. I do not need to make it a strict rule.'],
    ['assistant', 'Exactly. A routine can be supportive without becoming another standard you have to meet.']
  ] },
  { day: 19, title: 'Preparing for an interview', topic: 'Career and placement stress', mood: 'anxious', confidence: .86, strategy: 'skill_building', focus: 'interview preparation and uncertainty', categories: ['anxiety_management', 'career_stress'], messages: [
    ['user', 'I have an interview next week. I am nervous I will freeze when they ask me to introduce myself.'],
    ['assistant', 'That is a common moment to feel pressure around. Would outlining three points about your background help more than memorizing a full answer?'],
    ['user', 'Yes. I have a project, a volunteering role, and the course I am finishing.'],
    ['assistant', 'Those can form a simple structure: what you studied, one example of work you did, and what you are hoping to learn next. You can practice the ideas without locking in exact wording.'],
    ['user', 'I tried saying it once and it sounded more natural than the script I wrote.'],
    ['assistant', 'That is useful feedback from practice. Keep the three points as anchors and allow the wording to change.']
  ] },
  { day: 17, title: 'When plans change', topic: 'Flexibility', mood: 'confused', confidence: .73, strategy: 'reflective', focus: 'responding to an unexpected change', categories: ['problem_solving', 'emotional_wellbeing'], messages: [
    ['user', 'A friend cancelled plans at the last minute and I cannot tell if I am disappointed or just tired.'],
    ['assistant', 'You do not have to choose one feeling immediately. Disappointment and tiredness can both be present. What would be kind to yourself for the rest of the evening?'],
    ['user', 'Maybe make dinner and have a quiet night instead of trying to fill the time.'],
    ['assistant', 'That sounds like a gentle option. You can decide tomorrow whether you want to reschedule, once the first reaction has had some space.'],
    ['user', 'I feel less like I need to solve the friendship tonight.'],
    ['assistant', 'Giving yourself time can make room for a clearer conversation later if you still want one.']
  ] },
  { day: 15, title: 'A small win with coursework', topic: 'Academic progress', mood: 'hopeful', confidence: .8, strategy: 'empathetic_support', focus: 'recognizing progress', categories: ['motivation', 'self_compassion'], messages: [
    ['user', 'I submitted the assignment before midnight for once. It was not perfect, but I finished it.'],
    ['assistant', 'That sounds like a meaningful win, especially if finishing has felt difficult lately. What helped you keep going?'],
    ['user', 'I asked a classmate to sit with me in the library. We worked quietly for an hour.'],
    ['assistant', 'Having someone nearby may have made it easier to stay with the task. That is worth remembering for the next assignment.'],
    ['user', 'I might ask them again next week.'],
    ['assistant', 'You have found one support that fits you. It is okay to use it without needing to turn every study session into a big plan.']
  ] },
  { day: 13, title: 'Setting a boundary at home', topic: 'Family-related concerns', mood: 'angry', confidence: .78, strategy: 'reflective', focus: 'expressing a boundary respectfully', categories: ['communication', 'relationships'], messages: [
    ['user', 'I got irritated when my family kept asking about my plans after I said I needed time to think.'],
    ['assistant', 'It makes sense that repeated questions could feel frustrating when you have already asked for space. What would you want them to understand?'],
    ['user', 'That I will talk about it when I have a clearer answer, not because I am ignoring them.'],
    ['assistant', 'That is a clear message. You might say, “I know you care. I need a few days to think, and I will bring it up again this weekend.”'],
    ['user', 'That sounds less sharp than what I wanted to say earlier.'],
    ['assistant', 'You can acknowledge the frustration and still choose words that reflect what you need.']
  ] },
  { day: 11, title: 'Getting back to sleep', topic: 'Rest and stress', mood: 'stressed', confidence: .81, strategy: 'skill_building', focus: 'settling after nighttime worry', categories: ['sleep_hygiene', 'grounding'], messages: [
    ['user', 'I woke up at 3am thinking about deadlines and now I am worried I will be tired all day.'],
    ['assistant', 'Being awake with a busy mind can make the next day feel daunting. For this moment, would writing down the deadlines help you set them aside until morning?'],
    ['user', 'I wrote the two dates on a note. I am still awake, but the thoughts are less repetitive.'],
    ['assistant', 'That is a small shift. You could keep the lights low and try a slow exhale for a few minutes, without making sleep another task to complete.'],
    ['user', 'I will try resting instead of checking the time again.'],
    ['assistant', 'Rest still counts, even if sleep takes a while to return.']
  ] },
  { day: 9, title: 'Making space after a disagreement', topic: 'Relationship challenges', mood: 'sad', confidence: .76, strategy: 'empathetic_support', focus: 'processing a disagreement', categories: ['relationships', 'emotional_wellbeing'], messages: [
    ['user', 'My friend and I disagreed yesterday. We have not talked since and I keep replaying it.'],
    ['assistant', 'It can be hard to leave a conversation unresolved, especially when the friendship matters to you. What part keeps coming back most strongly?'],
    ['user', 'I wish I had said I was hurt instead of getting defensive.'],
    ['assistant', 'Noticing that now can help you choose what to say next. You could reach out when you feel ready and describe your own reaction without deciding the whole disagreement by text.'],
    ['user', 'I will draft something and wait until after class to send it.'],
    ['assistant', 'Taking a pause before sending gives you room to reread it with a little more distance.']
  ] },
  { day: 7, title: 'A steadier week', topic: 'Routine and wellbeing', mood: 'neutral', confidence: .7, strategy: 'reflective', focus: 'noticing what is working', categories: ['routine_building', 'self_care'], messages: [
    ['user', 'This week was ordinary. I had a couple of busy days, but I did not feel as scattered as last week.'],
    ['assistant', 'An ordinary week with a little more steadiness can be worth noticing. Did anything change in how you approached the busy days?'],
    ['user', 'I stopped trying to catch up on everything at night. I picked one task and then went to bed.'],
    ['assistant', 'That boundary may have protected your energy. You can keep it as an option without expecting every week to feel the same.'],
    ['user', 'I think that helped. I still have things to do, but they feel less tangled.'],
    ['assistant', 'It sounds like the tasks are still there, and you have a little more room around them.']
  ] },
  { day: 6, title: 'Before a presentation', topic: 'Academic stress', mood: 'anxious', confidence: .83, strategy: 'coaching', focus: 'preparing a flexible opening', categories: ['performance_anxiety', 'grounding'], messages: [
    ['user', 'My presentation is tomorrow and I keep rehearsing the first line until it sounds worse every time.'],
    ['assistant', 'Repeated rehearsal can start to make the words feel less natural. Would it help to remember the main idea of your opening instead of the exact sentence?'],
    ['user', 'The main idea is just what our group learned from the survey.'],
    ['assistant', 'That can be your anchor. You might take one slow breath, look at the first slide, and say that idea in your own words.'],
    ['user', 'I can do that. I am going to stop rehearsing for tonight.'],
    ['assistant', 'That sounds like a reasonable stopping point. You have a clear cue and can let the rest be conversational.']
  ] },
  { day: 5, title: 'After the presentation', topic: 'Confidence', mood: 'hopeful', confidence: .88, strategy: 'empathetic_support', focus: 'reflecting on a challenging moment', categories: ['self_confidence', 'motivation'], messages: [
    ['user', 'The presentation went better than I expected. I stumbled once but kept going.'],
    ['assistant', 'You got through the moment you were worried about, and a stumble did not stop you. What helped you continue?'],
    ['user', 'I looked at my slide and remembered the point I wanted to make.'],
    ['assistant', 'That is a useful reminder that you can recover your place without having every word memorized.'],
    ['user', 'I feel proud that I did not apologize for every small thing.'],
    ['assistant', 'That sounds like a change you worked for. You can let yourself appreciate it without needing the presentation to have been flawless.']
  ] },
  { day: 4, title: 'Planning around placement deadlines', topic: 'Career and placement stress', mood: 'overwhelmed', confidence: .85, strategy: 'coaching', focus: 'prioritizing applications and coursework', categories: ['career_stress', 'goal_setting'], messages: [
    ['user', 'Two applications and a lab report are due this week. I am having trouble deciding what to do first.'],
    ['assistant', 'That is a lot to hold in your head at once. Which item has the earliest deadline, and which needs input from someone else?'],
    ['user', 'The report is due Wednesday and needs my lab partner’s data. One application is due Friday.'],
    ['assistant', 'It may help to request the data today, then make a short outline for the report while you wait. That keeps the application from disappearing, too.'],
    ['user', 'I sent the message and blocked half an hour for the outline. That feels more concrete.'],
    ['assistant', 'You have started the parts that depend on you and opened a space for the next task.']
  ] },
  { day: 3, title: 'Asking for support', topic: 'Social support', mood: 'calm', confidence: .78, strategy: 'reflective', focus: 'identifying a supportive person', categories: ['social_support', 'self_care'], messages: [
    ['user', 'I told my cousin I have been stressed about placements. I usually keep it to myself.'],
    ['assistant', 'That can take courage, particularly if you are used to carrying it alone. How did it feel to say it out loud?'],
    ['user', 'A bit awkward at first, but they listened and did not immediately try to fix it.'],
    ['assistant', 'Being listened to without pressure can be helpful. You could let them know that kind of listening is what supports you.'],
    ['user', 'I think I will. I feel less alone with it now.'],
    ['assistant', 'I’m glad you found a response that felt supportive. Keep choosing the kind of help that works for you.']
  ] },
  { day: 2, title: 'A balanced weekend plan', topic: 'Personal development', mood: 'happy', confidence: .74, strategy: 'coaching', focus: 'balancing rest with preparation', categories: ['self_care', 'planning'], messages: [
    ['user', 'I finished my application draft and still had time to meet a friend today. That felt good.'],
    ['assistant', 'You made progress and kept room for something enjoyable. What made that balance possible today?'],
    ['user', 'I set a stopping time for the draft instead of polishing it all afternoon.'],
    ['assistant', 'A stopping point can protect both the work and your time. You can review it once more later without making every detail a full-day task.'],
    ['user', 'I am glad I went out. I came back with a clearer head.'],
    ['assistant', 'That is useful to notice. Rest and connection can be part of how you sustain your effort.']
  ] },
  { day: 1, title: 'Checking in before a busy day', topic: 'Emotional wellbeing', mood: 'hopeful', confidence: .8, strategy: 'reflective', focus: 'choosing a manageable priority', categories: ['grounding', 'goal_setting'], messages: [
    ['user', 'Tomorrow looks busy, but I have written down the first thing I need to do and packed my bag tonight.'],
    ['assistant', 'You have made the start of the day easier without trying to control every part of it. What would be a good enough outcome for tomorrow?'],
    ['user', 'Submit the report draft and attend class. Anything else is a bonus.'],
    ['assistant', 'That is a clear baseline. If the day changes, you can come back to those priorities and adjust from there.'],
    ['user', 'I feel more prepared than I did last night.'],
    ['assistant', 'That shift is worth noticing. You have a plan, and you can take the day one step at a time.']
  ] },
];

const moodIndicators = {
  anxious: ['uncertain', 'worrying', 'nervous'], stressed: ['pressure', 'deadlines', 'busy'], sad: ['hurt', 'disappointed', 'low'],
  overwhelmed: ['too much', 'switching tasks', 'hard to start'], calm: ['quieter', 'steady', 'resting'], hopeful: ['manageable', 'looking forward', 'more prepared'],
  confused: ['not sure', 'unclear', 'thinking it through'], angry: ['irritated', 'frustrated', 'boundary'], neutral: ['ordinary', 'steady', 'checking in'], happy: ['proud', 'good', 'enjoyable']
};

const dayContext = (date) => {
  const hour = date.getHours();
  return {
    timeOfDay: hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : hour < 21 ? 'evening' : 'night',
    dayOfWeek: ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][date.getDay()],
  };
};

async function seedAiTimeline(user) {
  for (const item of aiTimeline) {
    const demoKey = `solace-ai-${item.day}`;
    let chat = await Chat.findOne({ demoKey });
    if (chat && (!chat.isDemo || String(chat.userId) !== String(user._id))) {
      throw new Error(`Refusing to overwrite non-demo AI chat ${demoKey}`);
    }
    const sessionStart = new Date();
    sessionStart.setDate(sessionStart.getDate() - item.day);
    sessionStart.setHours([8, 11, 14, 18, 20][item.day % 5], [12, 24, 38, 46][item.day % 4], 0, 0);
    const moodScores = { happy: 8, hopeful: 8, calm: 9, neutral: 5, confused: 4, anxious: 3, sad: 2, overwhelmed: 2, stressed: 1, angry: 1 };
    const nextMood = item.mood === 'anxious' || item.mood === 'stressed' || item.mood === 'overwhelmed' ? 'hopeful' : item.mood;
    const messages = [];
    const moodLogs = [];
    for (let i = 0; i < item.messages.length; i += 1) {
      const [role, content] = item.messages[i];
      const timestamp = new Date(sessionStart.getTime() + i * 4 * 60000);
      if (role === 'user') {
        const pass = i / 2;
        const mood = pass === 0 ? item.mood : pass === 1 ? item.mood : nextMood;
        const confidence = Math.max(.65, Math.min(.94, item.confidence - pass * .025));
        const indicators = (moodIndicators[mood] || []).slice(0, 3);
        messages.push({ role, content, timestamp, detectedMood: mood, moodConfidence: confidence, safetyFlag: false });
        moodLogs.push({
          userId: user._id, chatId: chat?._id, mood, confidence, triggerMessage: content,
          indicators: indicators.map((phrase, index) => ({ phrase, weight: Math.max(.55, .9 - index * .15) })),
          reasoning: `Demo-only simulated ${mood} classification based on the user's wording and context.`,
          context: dayContext(timestamp), timestamp, createdAt: timestamp, updatedAt: timestamp, isDemo: true,
        });
      } else {
        const mood = i >= 4 ? nextMood : item.mood;
        messages.push({
          role, content, timestamp,
          agentSnapshot: {
            mood, moodConfidence: Math.max(.65, item.confidence - (i / 2 - 1) * .025),
            moodIndicators: moodIndicators[mood] || [],
            safety: { riskLevel: 'none', riskScore: 0, assessment: 'No elevated safety signal in this fictional sample conversation.', riskCategories: [], triggerPhrases: [], immediateAction: false },
            rag: { documentsFound: 2, categories: item.categories },
            plan: { strategy: item.strategy, primaryFocus: item.focus, keyPoints: [item.focus, 'Offer one manageable next step'], tone: 'warm and non-judgmental' },
            processingTime: 640 + ((item.day * 31 + i * 17) % 1180),
            followUp: i === item.messages.length - 1 ? 'What is one manageable next step you would like to carry forward?' : '',
            resources: [],
          },
        });
      }
    }
    const lastAt = messages[messages.length - 1].timestamp;
    chat = await Chat.findOneAndUpdate(
      { demoKey },
      { $set: {
        userId: user._id, demoKey, isDemo: true, title: item.title, messages,
        sessionStart, sessionEnd: lastAt,
        moodSummary: { primaryMood: nextMood, moodTrend: moodScores[nextMood] > moodScores[item.mood] ? 'improving' : 'stable' },
        containsSensitiveContent: false, createdAt: sessionStart, updatedAt: lastAt,
      } },
      { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true, timestamps: false }
    );
    await MoodLog.deleteMany({ userId: user._id, chatId: chat._id, isDemo: true });
    await MoodLog.insertMany(moodLogs.map(log => ({ ...log, chatId: chat._id })));
  }
}

async function upsertAccount(account) {
  let user = await User.findOne({ email: account.email });
  if (user && !user.isDemo) throw new Error(`Refusing to overwrite non-demo account ${account.email}`);
  if (!user) user = new User({ email: account.email });
  user.name = account.name;
  user.password = DEMO_PASSWORD;
  user.role = account.role;
  user.isDemo = true;
  user.isActive = true;
  await user.save();
  return user;
}

async function seed() {
  if (!process.env.MONGODB_URI) throw new Error('Set MONGODB_URI in server/.env before seeding demo data.');
  await mongoose.connect(process.env.MONGODB_URI);

  for (const account of demoAccounts) {
    const existing = await User.findOne({ email: account.email });
    if (existing && !existing.isDemo) throw new Error(`Refusing to overwrite non-demo account ${account.email}`);
    if (account.role === 'mentor' && existing) {
      const profile = await MentorProfile.findOne({ user: existing._id });
      if (profile && !profile.isDemo) throw new Error(`Refusing to overwrite a non-demo mentor profile for ${account.email}`);
    }
  }
  for (const { key } of sessionDefinitions(new Date())) {
    const existing = await MentorSession.findOne({ demoKey: key });
    if (existing && !existing.isDemo) throw new Error(`Refusing to overwrite non-demo session ${key}`);
  }

  const accounts = {};
  for (const account of demoAccounts) accounts[account.key] = await upsertAccount(account);

  const profiles = {};
  for (const key of ['maya', 'rohan', 'leela']) {
    const owner = accounts[key];
    const existing = await MentorProfile.findOne({ user: owner._id });
    if (existing && !existing.isDemo) throw new Error(`Refusing to overwrite a non-demo mentor profile for ${owner.email}`);
    profiles[key] = await MentorProfile.findOneAndUpdate(
      { user: owner._id },
      { $set: { ...mentorDetails[key], user: owner._id, availability: DAY_SLOTS, status: 'approved', isDemo: true, photoUrl: '' } },
      { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
    );
  }

  const sessions = {};
  for (const definition of sessionDefinitions(new Date())) {
    const existing = await MentorSession.findOne({ demoKey: definition.key });
    if (existing && !existing.isDemo) throw new Error(`Refusing to overwrite non-demo session ${definition.key}`);
    const activeSlot = ['pending', 'accepted'].includes(definition.status);
    const session = await MentorSession.findOneAndUpdate(
      { demoKey: definition.key },
      { $set: {
        demoKey: definition.key,
        user: accounts.user._id,
        mentor: profiles[definition.mentor]._id,
        startsAt: definition.startsAt,
        endsAt: definition.endsAt,
        timezone: 'UTC',
        meetingRoom: `solace-demo-${crypto.randomBytes(24).toString('hex')}`,
        note: definition.note,
        status: definition.status,
        activeSlot,
        summary: definition.summary,
        createdAt: definition.createdAt,
        updatedAt: definition.createdAt,
        isDemo: true
      } },
      { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true, timestamps: false }
    );
    sessions[definition.key] = session;
  }

  const nowForMessages = new Date();
  const firstChatStart = new Date(nowForMessages.getTime() - 22 * 60000);
  const pendingChatStart = new Date(nowForMessages.getTime() - 60 * 60000);
  const completedChatStart = new Date(sessions['maya-completed'].startsAt.getTime() - 2 * 3600000);
  const messageGroups = [
    conversation(sessions['maya-current-accepted']._id, accounts.user, accounts.maya, firstChatStart, [
      ['user', 'I have a short class presentation tomorrow and keep getting stuck on the opening. My notes are ready, but I keep imagining I will go blank.'],
      ['mentor', 'That sounds stressful, especially with it coming up tomorrow. Would it help more to find one opening sentence, or to take a minute to settle first?'],
      ['user', 'A sentence, I think. I want to sound like myself instead of memorising a script.'],
      ['mentor', 'You could start with: “I’ll walk through the two things our group found most useful.” It gives you a first step without locking you into exact wording.'],
      ['user', 'That feels natural. I can use the first slide as a prompt after that.'],
      ['mentor', 'Exactly. Let the slide be your cue, not a test you have to pass. We can check in before it begins.'],
      ['user', 'Thanks, that is manageable. I am going to try it once and then stop rehearsing.']
    ]),
    conversation(sessions['rohan-pending-request']._id, accounts.user, accounts.rohan, pendingChatStart, [
      ['user', 'Hi Rohan, thanks for considering the request. Placement season has started and I am not sure how to divide my time between applications and coursework.'],
      ['mentor', 'Hi Aarav, happy to talk it through. Is there one deadline or decision that feels most pressing this week?'],
      ['user', 'There is an application due Friday, but I also have a lab report. I keep switching between them and finishing neither.'],
      ['mentor', 'That back-and-forth can use up a lot of energy. We could map the deadlines and choose a first 30-minute block for each. Does that sound useful?'],
      ['user', 'Yes. I would also like to talk about how much time interview prep should get before I even hear back.']
    ]),
    conversation(sessions['maya-completed']._id, accounts.user, accounts.maya, completedChatStart, [
      ['user', 'I make a detailed study plan on Sunday, then if Monday goes badly I feel like the whole week is already off track.'],
      ['mentor', 'It sounds as though the plan leaves very little room for an ordinary messy day. What part of it is hardest to restart?'],
      ['user', 'Usually I skip lunch to catch up, then I am tired by the afternoon and stop altogether.'],
      ['mentor', 'Would a plan with fewer blocks and a protected lunch feel more realistic than trying to make the day perfect?'],
      ['user', 'Probably. Three focused blocks feels less impressive, but I could actually do that.'],
      ['mentor', 'A plan is useful when it helps you return, not when it looks ambitious on paper. We can treat the other blocks as optional.'],
      ['user', 'I tried it this week and missed one block without throwing the rest away. That was new for me.'],
      ['mentor', 'That is a useful change to notice. Keep the version that gave you room to continue.']
    ])
  ];

  for (const key of ['maya-current-accepted', 'rohan-pending-request', 'maya-completed']) {
    await MentorMessage.deleteMany({ session: sessions[key]._id });
  }
  await MentorMessage.insertMany(messageGroups.flat());

  await seedAiTimeline(accounts.user);

  console.log('Demo data is ready. All seeded accounts and records are marked as demo.');
  console.log('User:   demo.user@solace.local');
  console.log('Mentor: demo.mentor.maya@solace.local');
  console.log(`Password for both: ${DEMO_PASSWORD}`);
  console.log('Other mentor accounts: demo.mentor.rohan@solace.local, demo.mentor.leela@solace.local');
}

seed()
  .catch(error => { console.error(error.message); process.exitCode = 1; })
  .finally(async () => { await mongoose.disconnect(); });
