import * as React from 'react'

import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from '@react-email/components'

import {
  brandBar,
  brandName,
  button,
  card,
  container,
  divider,
  footer,
  h1,
  link,
  main,
  text,
} from './styles'

interface InviteEmailProps {
  siteName: string
  siteUrl: string
  confirmationUrl: string
}

export const InviteEmail = ({
  siteName,
  siteUrl,
  confirmationUrl,
}: InviteEmailProps) => (
  <Html lang="pt-BR" dir="ltr">
    <Head />
    <Preview>Você foi convidado para o {siteName}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={card}>
          <div style={brandBar} />
          <Text style={brandName}>{siteName}</Text>
          <Heading style={h1}>Você foi convidado</Heading>
          <Text style={text}>
            Você recebeu um convite para fazer parte do{' '}
            <Link href={siteUrl} style={link}>
              <strong>{siteName}</strong>
            </Link>
            . Clique no botão abaixo para aceitar e criar sua conta.
          </Text>
          <Button style={button} href={confirmationUrl}>
            Aceitar convite
          </Button>
          <Hr style={divider} />
          <Text style={footer}>
            Se você não esperava este convite, pode ignorar este e-mail com
            segurança.
          </Text>
        </Section>
      </Container>
    </Body>
  </Html>
)

export default InviteEmail
