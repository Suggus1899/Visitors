export interface CameraDevice {
  deviceId: string;
  label: string;
}

export const getCameraDevices = async (): Promise<CameraDevice[]> => {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices
      .filter(d => d.kind === 'videoinput')
      .map(d => ({ deviceId: d.deviceId, label: d.label || `Cámara ${d.deviceId.slice(0, 8)}` }));
  } catch {
    return [];
  }
};

export const requestCameraPermission = async (): Promise<boolean> => {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    stream.getTracks().forEach(t => t.stop());
    return true;
  } catch {
    return false;
  }
};

export default getCameraDevices;
