import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';

export const userApi = {
  async getUsersByType(type: 'desktop' | 'mobile') {
    const response = await axios.get(`${API_URL}/users/type/${type}`);
    return response.data;
  },

  async createUser(userData: any) {
    const response = await axios.post(`${API_URL}/users`, userData);
    return response.data;
  },

  async updateUser(id: number, userData: any) {
    const response = await axios.put(`${API_URL}/users/${id}`, userData);
    return response.data;
  },

  async deleteUser(id: number) {
    const response = await axios.delete(`${API_URL}/users/${id}`);
    return response.data;
  },

  async getRoles() {
    const response = await axios.get(`${API_URL}/roles`);
    return response.data;
  },
};
