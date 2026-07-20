import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    BarElement,
    LineElement,
    PointElement,
    ArcElement,
    Title,
    Tooltip,
    Legend,
    Filler,
} from 'chart.js';

// Register all Chart.js components once for the entire app.
ChartJS.register(
    CategoryScale,
    LinearScale,
    BarElement,
    LineElement,
    PointElement,
    ArcElement,
    Title,
    Tooltip,
    Legend,
    Filler,
);

// Shared chart options helpers that adapt to the CSS variable theme.
export const chartGridColor = '#1f2a33';
export const chartTickColor = '#b1bcc6';
export const chartBorderColor = '#2e3842';
export const chartAccentColor = '#4dd7ff';

export const baseChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
        legend: {
            labels: { color: chartTickColor },
        },
        tooltip: {
            backgroundColor: '#0f1418',
            padding: 12,
            cornerRadius: 8,
            titleColor: '#e5edf5',
            bodyColor: '#b1bcc6',
            borderColor: chartBorderColor,
            borderWidth: 1,
        },
    },
    scales: {
        y: {
            beginAtZero: true,
            grid: { color: chartGridColor },
            ticks: { color: chartTickColor },
            border: { color: chartBorderColor },
        },
        x: {
            grid: { display: false },
            ticks: { color: '#7c8a97' },
            border: { color: chartBorderColor },
        },
    },
};
