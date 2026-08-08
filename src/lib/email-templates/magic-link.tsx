import * as React from 'react'

import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
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
  main,
  text,
} from './styles'

interface MagicLinkEmailProps {
  siteName: string
  confirmationUrl: string
}

export const MagicLinkEmail = ({
  siteName,
  confirmationUrl,
}: MagicLinkEmailProps) => (
  <Html lang="pt-BR" dir="ltr">
    <Head />
    <Preview>Seu link de acesso ao {siteName}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={card}>
          <div style={brandBar} />
          <Text style={brandName}>{siteName}</Text>
          <Heading style={h1}>Seu link de acesso</Heading>
          <Text style={text}>
            Clique no botão abaixo para entrar no {siteName}. Por segurança,
            este link expira em poucos minutos.
          </Text>
          <Button style={button} href={confirmationUrl}>
            Entrar agora
          </Button>
          <Hr style={divider} />
          <Text style={footer}>
            Se você não pediu este link, pode ignorar este e-mail com
            segurança.
          </Text>
        </Section>
      </Container>
    </Body>
  </Html>
)

export default MagicLinkEmail
