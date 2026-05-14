const prisma = require('../config/db');
const userService = require('../services/user.service');

// Used by Admin/Staff mapped to /api/admin/users
const getAllUsers = async (req, res) => {
  try {
    const { role, search } = req.query;
    const users = await userService.getUsers(role, search);
    res.status(200).json({ success: true, count: users.length, users });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const createUser = async (req, res) => {
  try {
    const user = await userService.createUser(req.body, req.files);
    res.status(201).json({ success: true, message: 'User created successfully', user });
  } catch (error) {

    res.status(400).json({ success: false, message: error.message });
  }
};

const updateUser = async (req, res) => {
  try {
    const user = await userService.updateUser(req.params.id, req.body, req.files);
    res.status(200).json({ success: true, message: 'User updated successfully', user });
  } catch (error) {

    res.status(400).json({ success: false, message: error.message });
  }
};

const approveUser = async (req, res) => {
  try {
    const { isApproved } = req.body;
    const user = await userService.approveUser(req.params.id, isApproved);
    res.status(200).json({ 
      success: true, 
      message: `User ${isApproved ? 'approved' : 'put back to pending'} successfully`, 
      user 
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

const deleteUser = async (req, res) => {
  try {
    await userService.deleteUser(req.params.id);
    res.status(200).json({ success: true, message: 'User deleted successfully' });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

const getAgentClients = async (req, res) => {
  try {
    const clients = await userService.getAgentClients(req.user.id);
    res.status(200).json({ success: true, count: clients.length, clients });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = { 
  getAllUsers,
  createUser,
  updateUser,
  approveUser,
  deleteUser,
  getAgentClients
};
