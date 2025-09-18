import * as React from 'react'
import { Html, Head, Preview, Body, Container, Section, Text, Heading, Button, Img, Hr, Tailwind } from '@react-email/components'

type InviteEmailProps = {
  championshipName: string
  teamName: string
  inviteUrl: string
  recipientName?: string
  expiresAt?: string
  inviterName?: string
  supportEmail?: string
}

export default function TeamInviteEmail({
  championshipName,
  teamName,
  inviteUrl,
  recipientName = 'Játékos',
  expiresAt,
  inviterName = 'ELITE Beerpong',
  supportEmail = 'sorpingpong@gmail.com',
}: InviteEmailProps) {
  const backendBase = process.env.BACKEND_PUBLIC_URL || `http://localhost:${process.env.BACKEND_PORT || 3555}`;
  const logoUrl = `${backendBase}/uploads/logo.png`;
  const bgUrl = `${backendBase}/uploads/bg.png`;
  return (
    <Html>
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      </Head>
      <Preview>{championshipName} - Üdv az új szezonban</Preview>
      <Tailwind>
        <Body className="bg-[#0b1221] font-sans" style={{ margin: 0, padding: 0 }}>
          <Container className="bg-white rounded-2xl overflow-hidden" style={{ width: '100%', maxWidth: '640px', margin: '32px auto' }}>
            <Section
              className="px-6 py-6 text-white text-center"
              style={{
                backgroundImage: `url('${bgUrl}')`,
                backgroundRepeat: 'no-repeat',
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                backgroundColor: '#0b1221',
              }}
            >
              <Section
                style={{
                  backgroundColor: 'rgba(11,18,33,0.72)',
                  padding: '16px',
                  borderRadius: '12px',
                  display: 'block',
                  width: '100%',
                  maxWidth: '560px',
                  margin: '0 auto',
                  justifyItems: 'center',
                }}
              >
                <Img src={logoUrl} alt="ELITE Beerpong" width={300} height={48} className="mx-auto" style={{ width: '100%', maxWidth: '220px', height: 'auto' }} />
                <Heading className="text-2xl mt-3 mb-0">{championshipName} - Üdv az új szezonban</Heading>
                <Text className="text-white/80 mt-1">Csatlakozz és kezdd el a szezont velünk!</Text>
              </Section>
            </Section>

            <Section className="px-8 py-6 text-[#0b1221]">
              <Text className="text-sm text-gray-700">Szia {recipientName},</Text>
              <Text className="text-base leading-6 mt-2">
                Meghívást kapott csapatod, a(z) <strong>{teamName}</strong>, hogy csatlakozzatok a(z) <strong>{championshipName}</strong> szezonjában. Az alábbi gombra kattintva elfogadhatod a meghívást és befejezheted a regisztrációt. Ha a jelszó megadása után véletlen bezárnád az ablakot, abban az esetben bejelentkezés után egyből látni fogod a meghívót!
              </Text>

              <Section className="text-center my-8">
                <Button href={inviteUrl} className="bg-[#ff5c1a] text-white rounded-lg font-semibold"
                  style={{ display: 'block', width: '100%', maxWidth: '360px', margin: '0 auto', padding: '12px 5px' }}>
                  Meghívás elfogadása
                </Button>
              </Section>

              {expiresAt && (
                <Text className="text-xs text-gray-500">A meghívó lejárata: {expiresAt}</Text>
              )}

              <Hr className="my-6 border-gray-200" />

              <Text className="text-sm text-gray-700">
                Ha nem te kérted ezt a meghívót, kérjük hagyd figyelmen kívül ezt az e-mailt. Kérdés esetén vedd fel velünk a kapcsolatot: {supportEmail}
              </Text>
              <Text className="text-sm text-gray-700 mt-4">Üdvözlettel,<br />{inviterName}</Text>
            </Section>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  )
}

TeamInviteEmail.PreviewProps = {
championshipName: 'ELITE Beerpong 2025/2026 Ősz',
  teamName: ' Új csapat',
  inviteUrl: 'https://example.com/invite/abc123',
  recipientName: 'Erik',
  expiresAt: '2025-12-31 23:59',
  inviterName: 'ELITE Beerpong',
  supportEmail: 'sorpingpong@gmail.com',
}