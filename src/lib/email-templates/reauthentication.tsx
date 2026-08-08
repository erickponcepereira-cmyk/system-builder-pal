import * as React from 'react'

import {
  Body,
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
  card,
  codeStyle,
  container,
  divider,
  footer,
  h1,
  main,
  text,
} from './styles'

interface ReauthenticationEmailProps {
  token: string
}

export const ReauthenticationEmail = ({
  token,
}: ReauthenticationEmailProps) => (
  <Html lang="pt-BR" dir="ltr">
    <Head />
    <Preview>Seu código de verificação</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={card}>
          <div style={brandBar} />
          <Text style={brandName}>FitMind Club</Text>
          <Heading style={h1}>Confirme sua identidade</Heading>
          <Text style={text}>
            Use o código abaixo para concluir a verificação:
          </Text>
          <Text style={codeStyle}>{token}</Text>
          <Hr style={divider} />
          <Text style={footer}>
            O código expira em poucos minutos. Se não foi você, ignore este
            e-mail.
          </Text>
        </Section>
      </Container>
    </Body>
  </Html>
)

export default ReauthenticationEmail
