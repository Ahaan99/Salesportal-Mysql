const { Router } = require("express");
const { requireAuth, requireRole } = require("../middleware/auth");
const crm = require("../controllers/crm.controller");

const router = Router();
router.use(requireAuth, requireRole("field", "admin"));

// Leads CRUD
router.get("/leads",           crm.listLeads);
router.post("/leads",          crm.createLead);
router.get("/leads/:id",       crm.getLead);
router.patch("/leads/:id",     crm.updateLead);
router.delete("/leads/:id",    crm.deleteLead);

// Follow-ups (nested under a lead)
router.get("/leads/:id/follow-ups",   crm.listFollowUps);
router.post("/leads/:id/follow-ups",  crm.createFollowUp);
router.patch("/follow-ups/:id",       crm.updateFollowUp);
router.delete("/follow-ups/:id",      crm.deleteFollowUp);

// All follow-ups (flat list, scoped to officer)
router.get("/follow-ups",      crm.listAllFollowUps);

// Tasks (own list + CRUD)
router.get("/tasks",           crm.listTasks);
router.post("/tasks",          crm.createTask);
router.patch("/tasks/:id",     crm.updateTask);
router.delete("/tasks/:id",    crm.deleteTask);

// Meetings
router.get("/meetings",        crm.listMeetings);
router.post("/meetings",       crm.createMeeting);
router.patch("/meetings/:id",  crm.updateMeeting);
router.delete("/meetings/:id", crm.deleteMeeting);

// Notes (nested under a lead)
router.get("/leads/:id/notes",  crm.listNotes);
router.post("/leads/:id/notes", crm.createNote);
router.delete("/notes/:id",     crm.deleteNote);

module.exports = router;
