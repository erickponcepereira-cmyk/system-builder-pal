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

interface RecoveryEmailProps {
  siteName: string
  confirmationUrl: string
}

export const RecoveryEmail = ({
  siteName,
  confirmationUrl,
}: RecoveryEmailProps) => (
  <Html lang="pt-BR" dir="ltr">
    <Head />
    <Preview>Redefina sua senha do {siteName}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={card}>
          <div style={brandBar} />
          <Text style={brandName}>{siteName}</Text>
          <Heading style={h1}>Redefinir senha</Heading>
          <Text style={text}>
            Recebemos um pedido para redefinir a senha da sua conta no{' '}
            {siteName}. Clique no botão abaixo para criar uma nova senha.
          </Text>
          <Button style={button} href={confirmationUrl}>
            Criar nova senha
          </Button>
          <Hr style={divider} />
          <Text style={footer}>
            Se você não pediu a redefinição, ignore este e-mail — sua senha
            atual continua valendo.
          </Text>
        </Section>
      </Container>
    </Body>
  </Html>
)

export default RecoveryEmail
