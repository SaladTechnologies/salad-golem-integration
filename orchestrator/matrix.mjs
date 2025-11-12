import config from 'config';

const matrixApiUrl = config.get('matrixApiUrl');
const matrixApiKey = config.get('matrixApiKey');

const headers = {
  'Authorization': `Bearer ${matrixApiKey}`
};

export async function getGpuClasses() {
  // Use fetch to get GPU classes from the Matrix REST API
  const response = await fetch(`${matrixApiUrl}/api/v2/matrix/gpu-classes`, { headers });
  const data = await response.json();
  return data;
}

export async function getNodeState(id) {
  // Use fetch to get node state from the Matrix REST API
  const response = await fetch(`${matrixApiUrl}/api/v2/matrix/nodes/${id}`, { headers });
  const data = await response.json();
  return data;
}
