import React, { useRef, useState, useCallback, useEffect } from 'react';
import Webcam from 'react-webcam';
import Camera from 'lucide-react/dist/esm/icons/camera';
import RefreshCcw from 'lucide-react/dist/esm/icons/refresh-ccw';
import X from 'lucide-react/dist/esm/icons/x';
import Upload from 'lucide-react/dist/esm/icons/upload';
import ImageIcon from 'lucide-react/dist/esm/icons/image';
import ChevronDown from 'lucide-react/dist/esm/icons/chevron-down';
import toast from 'react-hot-toast';
import { validateImage } from '../utils/photoValidator';

interface CameraDevice {
    deviceId: string;
    label: string;
}

interface PhotoCaptureProps {
    onCapture: (imageSrc: string) => void;
    onRetake: () => void;
    initialImage?: string | null;
}

const PhotoCapture: React.FC<PhotoCaptureProps> = ({ onCapture, onRetake, initialImage }) => {
    const webcamRef = useRef<Webcam>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [image, setImage] = useState<string | null>(initialImage || null);
    const [isActive, setIsActive] = useState(false);
    const [countdown, setCountdown] = useState<number | null>(null);
    const [showGuide, setShowGuide] = useState(true);
    const [cameras, setCameras] = useState<CameraDevice[]>([]);
    const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');

    // Enumerate available cameras on mount
    useEffect(() => {
        const loadCameras = async () => {
            try {
                // Request permission first so labels are available
                await navigator.mediaDevices.getUserMedia({ video: true }).then(s => s.getTracks().forEach(t => t.stop()));
                const devices = await navigator.mediaDevices.enumerateDevices();
                const videoDevices = devices
                    .filter(d => d.kind === 'videoinput')
                    .map((d, i) => ({
                        deviceId: d.deviceId,
                        label: d.label || `Cámara ${i + 1}`
                    }));
                setCameras(videoDevices);
                if (videoDevices.length > 0 && !selectedDeviceId) {
                    setSelectedDeviceId(videoDevices[0].deviceId);
                }
            } catch {
                // Permission denied or no cameras — will fall back to default
            }
        };
        loadCameras();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleCapture = useCallback(() => {
        if (webcamRef.current) {
            const imageSrc = webcamRef.current.getScreenshot();
            if (imageSrc) {
                // Validate the captured image
                const validation = validateImage(imageSrc);
                if (!validation.isValid) {
                    toast.error(validation.error || 'Imagen inválida');
                    return;
                }

                setImage(imageSrc);
                onCapture(imageSrc);
                setIsActive(false);
            }
        }
    }, [webcamRef, onCapture]);

    // Countdown effect
    useEffect(() => {
        if (countdown === null || countdown === 0) {
            if (countdown === 0) {
                handleCapture();
                setCountdown(null); // Reset countdown after capture
            }
            return;
        }

        const timer = setTimeout(() => {
            setCountdown(countdown - 1);
        }, 1000);

        return () => clearTimeout(timer);
    }, [countdown, handleCapture]);

    const startCountdown = () => {
        setShowGuide(false);
        setCountdown(3);
    };

    const handleRetake = () => {
        setImage(null);
        onRetake();
        setIsActive(true);
        setShowGuide(true);
    };

    const startCamera = () => {
        setIsActive(true);
        setShowGuide(true);
    };

    const stopCamera = () => {
        setIsActive(false);
        setCountdown(null);
    };

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                const result = reader.result as string;

                // Validate the uploaded image
                const validation = validateImage(result);
                if (!validation.isValid) {
                    toast.error(validation.error || 'Imagen inválida');
                    return;
                }

                setImage(result);
                onCapture(result);
            };
            reader.readAsDataURL(file);
        }
    };

    const triggerFileUpload = () => {
        fileInputRef.current?.click();
    };

    // Image preview state
    if (image) {
        return (
            <div className="relative w-full max-w-sm mx-auto animate-fadeIn">
                <img src={image} alt="Visitor" className="rounded-lg border border-[color:var(--border-1)] shadow-md w-full object-cover" />
                <button
                    type="button"
                    onClick={handleRetake}
                    className="absolute bottom-4 right-4 bg-[color:var(--surface-2)] text-[color:var(--text-1)] p-2 rounded-full shadow-lg hover:bg-[color:var(--surface-1)] transition-colors"
                    title="Retomar Foto"
                >
                    <RefreshCcw size={20} />
                </button>
            </div>
        );
    }

    // Inactive state - show options
    if (!isActive) {
        return (
            <div className="w-full max-w-sm mx-auto space-y-3">
                {/* Camera selector — only shown when multiple cameras detected */}
                {cameras.length > 1 && (
                    <div className="relative">
                        <label className="block text-[10px] font-semibold text-[color:var(--text-3)] uppercase tracking-[0.15em] mb-1">
                            Seleccionar cámara
                        </label>
                        <div className="relative">
                            <Camera size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[color:var(--text-3)] pointer-events-none" />
                            <select
                                value={selectedDeviceId}
                                onChange={(e) => setSelectedDeviceId(e.target.value)}
                                className="w-full pl-8 pr-8 py-2 text-sm bg-[color:var(--surface-1)] border border-[color:var(--border-1)] rounded-lg text-[color:var(--text-1)] focus:outline-none focus:border-[color:var(--accent-0)] appearance-none cursor-pointer"
                            >
                                {cameras.map((cam) => (
                                    <option key={cam.deviceId} value={cam.deviceId}>
                                        {cam.label}
                                    </option>
                                ))}
                            </select>
                            <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-[color:var(--text-3)] pointer-events-none" />
                        </div>
                    </div>
                )}

                {/* Camera trigger */}
                <div
                    className="h-40 bg-[color:var(--surface-2)] border-2 border-dashed border-[color:var(--border-1)] rounded-lg flex flex-col items-center justify-center cursor-pointer hover:border-[color:var(--accent-0)] transition-all group"
                    onClick={startCamera}
                >
                    <div className="bg-[color:var(--surface-1)] p-3 rounded-full shadow-sm mb-2 group-hover:shadow-md transition-shadow">
                        <Camera size={24} className="text-[color:var(--text-3)] group-hover:text-[color:var(--accent-0)] transition-colors" />
                    </div>
                    <span className="text-sm text-[color:var(--text-3)] font-medium group-hover:text-[color:var(--accent-0)]">Usar Cámara</span>
                    {cameras.length === 1 && (
                        <span className="text-[10px] text-[color:var(--text-3)] mt-0.5 opacity-60 truncate max-w-[90%] text-center px-2">
                            {cameras[0].label}
                        </span>
                    )}
                </div>

                {/* File upload alternative */}
                <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/jpg,image/png"
                    onChange={handleFileUpload}
                    className="hidden"
                />
                <button
                    type="button"
                    onClick={triggerFileUpload}
                    className="w-full py-2 px-4 border border-[color:var(--border-1)] rounded-lg text-sm text-[color:var(--text-2)] hover:bg-[color:var(--surface-2)] hover:border-[color:var(--accent-0)] transition-colors flex items-center justify-center gap-2"
                >
                    <Upload size={16} />
                    Subir desde archivo
                </button>
            </div>
        );
    }

    // Active webcam state
    return (
        <div className="flex flex-col items-center space-y-3 w-full max-w-sm mx-auto">
            <div className="relative w-full rounded-lg overflow-hidden shadow-md bg-black border border-[color:var(--border-1)]">
                <Webcam
                    audio={false}
                    ref={webcamRef}
                    screenshotFormat="image/jpeg"
                    className="w-full"
                    videoConstraints={
                        selectedDeviceId
                            ? { width: 400, height: 400, deviceId: { exact: selectedDeviceId } }
                            : { width: 400, height: 400, facingMode: 'user' }
                    }
                />

                {/* Face guide overlay */}
                {showGuide && !countdown && (
                    <div className="face-guide-overlay">
                        <div className="face-guide-silhouette" />
                    </div>
                )}

                {/* Countdown overlay */}
                {countdown !== null && (
                    <div className="countdown-overlay">
                        <span
                            key={countdown}
                            className="countdown-number animate-pulse-countdown"
                        >
                            {countdown}
                        </span>
                    </div>
                )}

                {/* Close button */}
                <button
                    type="button"
                    onClick={stopCamera}
                    className="absolute top-2 right-2 text-white bg-black bg-opacity-50 rounded-full p-1 hover:bg-opacity-75 z-20"
                >
                    <X size={20} />
                </button>

                {/* Guide toggle */}
                {!countdown && (
                    <button
                        type="button"
                        onClick={() => setShowGuide(!showGuide)}
                        className="absolute top-2 left-2 text-white bg-black bg-opacity-50 rounded-full p-1 hover:bg-opacity-75 text-xs px-2 z-20"
                    >
                        {showGuide ? 'Ocultar guía' : 'Mostrar guía'}
                    </button>
                )}
            </div>

            {/* Capture button */}
            <div className="flex gap-2">
                <button
                    type="button"
                    onClick={startCountdown}
                    disabled={countdown !== null}
                    className="flex items-center space-x-2 bg-[color:var(--accent-0)] text-[#081116] px-6 py-2 rounded-full hover:bg-[color:var(--accent-1)] transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <Camera size={20} />
                    <span>{countdown !== null ? 'Capturando...' : 'Capturar (3s)'}</span>
                </button>

                {/* Instant capture option */}
                <button
                    type="button"
                    onClick={handleCapture}
                    disabled={countdown !== null}
                    className="flex items-center px-4 py-2 border border-[color:var(--accent-0)] text-[color:var(--accent-0)] rounded-full hover:bg-[color:var(--surface-2)] transition-colors disabled:opacity-50"
                    title="Captura instantánea"
                >
                    <ImageIcon size={18} />
                </button>
            </div>
        </div>
    );
};

export default PhotoCapture;
