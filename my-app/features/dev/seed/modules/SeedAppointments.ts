import { ApiClient } from '../utils/ApiClient';
import { DataGenerator } from '../utils/DataGenerator';

export class SeedAppointments {
    private api: ApiClient;
    private gen: DataGenerator;

    constructor(api: ApiClient, gen: DataGenerator) {
        this.api = api;
        this.gen = gen;
    }

    async seedAppointments(
        appointmentsId: string,
        data: {
            customerId: string,
            unitId: string,
            employeeId: string,
            serviceId: string,
            date: string,
            status: 'Scheduled' | 'Completed' | 'No-Show' | 'Cancelled'
        }
    ) {
        try {
            const notes = this.gen.randomElement([
                'Cliente solicitou preferência por silêncio.',
                'Alergia a esmalte comum, usar hipoalergênico.',
                'Primeira visita - Indicação Instagram.',
                'Avaliação para mechas necessária.',
                'Cliente VIP - Servir café espresso.'
            ]);

            // Ensure startAt is in the FUTURE for the seeder to pass validation if status is 'Scheduled'
            // For 'Completed'/'Cancelled', legacy data might be allowed depending on backend, 
            // but the error reported was specifically for past scheduling.
            // Let's use current/future dates for Scheduled.
            let startAt = data.date;
            if (data.status === 'Scheduled' && new Date(startAt) < new Date()) {
                startAt = new Date(Date.now() + this.gen.randomInt(1, 48) * 60 * 60 * 1000).toISOString();
            }

            const newApptId = await this.api.postRow(appointmentsId, {
                customerId: data.customerId,
                unitId: data.unitId,
                responsibleEmployeeId: data.employeeId,
                serviceId: data.serviceId,
                startAt: startAt,
                endAt: new Date(new Date(startAt).getTime() + 60 * 60 * 1000).toISOString(),
                status: data.status,
                notes,
                __isSystem: true
            }, 'Appointments');
            return newApptId;
        } catch (error: any) {
            console.warn(`[SeedAppointments] ⚠️ Skipped: ${error.message}`);
            return null;
        }
    }
}
