export interface ActivityItem {
    id: number;
    userId: number;
    username: string;
    action: string;
    entity: string;
    entityId?: string;
    details?: string;
    ipAddress?: string;
    userAgent?: string;
    createdAt: string;
}

export interface Stats {
    today: {
        logins: number;
        actions: number;
        uniqueUsers: number;
        uniqueIPs: number;
    };
    lastWeek: {
        dailyActivity: { date: string; count: number }[];
    }
}
