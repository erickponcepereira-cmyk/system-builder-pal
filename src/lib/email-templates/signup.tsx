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

interface SignupEmailProps {
  siteName: string
  siteUrl: string
  recipient: string
  confirmationUrl: string
}

export const SignupEmail = ({
  siteName,
  siteUrl,
  recipient,
  confirmationUrl,
}: SignupEmailProps) => (
  <Html lang="pt-BR" dir="ltr">
    <Head />
    <Preview>Confirme seu e-mail para ativar sua conta {siteName}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={card}>
          <div style={brandBar} />
          <Text style={brandName}>{siteName}</Text>
          <Heading style={h1}>Confirme seu e-mail</Heading>
          <Text style={text}>
            Que bom ter você no{' '}
            <Link href={siteUrl} style={link}>
              <strong>{siteName}</strong>
            </Link>
            ! Falta só um passo para ativar sua conta.
          </Text>
          <Text style={text}>
            Confirme o endereço{' '}
            <Link href={`mailto:${recipient}`} style={link}>
              {recipient}
            </Link>{' '}
            clicando no botão abaixo:
          </Text>
          <Button style={button} href={confirmationUrl}>
            Confirmar meu e-mail
          </Button>
          <Hr style={divider} />
          <Text style={footer}>
            Se você não criou esta conta, pode ignorar este e-mail com
            segurança.
          </Text>
        </Section>
      </Container>
    </Body>
  </Html>
)

export default SignupEmail
