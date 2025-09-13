export const brevoService = {
    async subscribeToNewsletter(email: string, fetch: typeof globalThis.fetch): Promise<{ success: boolean; error?: string }> {
      const brevoApiKey = process.env.BREVO_API_KEY!;
      const brevoApiUrl = process.env.BREVO_API_URL!;
      const brevoListId = Number(process.env.BREVO_LIST_ID!);
  
      const res = await fetch(brevoApiUrl, {
        method: 'POST',
        headers: {
          'api-key': brevoApiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email,
          listIds: [brevoListId],
          updateEnabled: true,
        }),
      });
  
      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        console.error('Brevo error:', error);
        return { success: false, error: 'Brevo request failed' };
      }
  
      return { success: true };
    },
  };