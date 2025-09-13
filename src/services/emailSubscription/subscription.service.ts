import { db } from "../../db";
import { emailSubscriptions } from "../../database/schema";
import { eq } from "drizzle-orm";
import { brevoService } from "./brevo.service";

export const subscribeToEmail = async (email: string) => {
    try {
        const existingSubscription = await db.select().from(emailSubscriptions).where(eq(emailSubscriptions.email, email));
        if (existingSubscription.length > 0) {
            return {
                status: 'error',
                data: 'email_subscription_already_exists',
            }
        }
        const subscription = await db.insert(emailSubscriptions).values({ email });
        await brevoService.subscribeToNewsletter(email, fetch);
        return {
            status: 'ok',
            data: 'success',
        }
    } catch (error) {
        return {
            status: 'error',
            data: error,
        }
    }
};

export const getAllSubscriptions = async () => {
    try {
        const subscriptions = await db.select().from(emailSubscriptions);
        return {
            status: 'success',
            data: subscriptions
        };
    } catch (error) {
        return {
            status: 'error',
            data: error
        };
    }
};