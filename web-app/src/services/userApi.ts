import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';

const handleApiError = (error: any, action: string) => {
  console.error(`User API error during ${action}:`, error);
  return error.response?.data || {
    success: false,
    message: error.message || `Failed to ${action}`,
  };
};

export const userApi = {
  async getUsersByType(type: 'desktop' | 'mobile') {
    try {
      const response = await axios.get(`${API_URL}/users/type/${type}`);
      return response.data;
    } catch (error: any) {
      return handleApiError(error, 'fetch users by type');
    }
  },

  async createUser(userData: any) {
    try {
      const response = await axios.post(`${API_URL}/users`, userData);
      return response.data;
    } catch (error: any) {
      return handleApiError(error, 'create user');
    }
  },

  async updateUser(id: number, userData: any) {
    try {
      const response = await axios.put(`${API_URL}/users/${id}`, userData);
      return response.data;
    } catch (error: any) {
      return handleApiError(error, 'update user');
    }
  },

  async deleteUser(id: number) {
    try {
      const response = await axios.delete(`${API_URL}/users/${id}`);
      return response.data;
    } catch (error: any) {
      return handleApiError(error, 'delete user');
    }
  },

  async getRoles() {
    try {
      const response = await axios.get(`${API_URL}/roles`);
      return response.data;
    } catch (error: any) {
      return handleApiError(error, 'fetch roles');
    }
  },
};
