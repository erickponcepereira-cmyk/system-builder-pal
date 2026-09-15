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

interface EmailChangeEmailProps {
  siteName: string
  // oldEmail is the user's current address (HookData.OldEmail). For the
  // NEW-recipient half of a secure email_change fanout, `email` equals the
  // recipient (NEW), so the "from" line must render oldEmail to read
  // "from OLD to NEW" instead of "from NEW to NEW".
  oldEmail: string
  email: string
  newEmail: string
  confirmationUrl: string
}

export const EmailChangeEmail = ({
  siteName,
  oldEmail,
  newEmail,
  confirmationUrl,
}: EmailChangeEmailProps) => (
  <Html lang="pt-BR" dir="ltr">
    <Head />
    <Preview>Confirme a troca de e-mail no {siteName}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={card}>
          <div style={brandBar} />
          <Text style={brandName}>{siteName}</Text>
          <Heading style={h1}>Confirme a troca de e-mail</Heading>
          <Text style={text}>
            Você pediu para alterar o e-mail da sua conta no {siteName} de{' '}
            <Link href={`mailto:${oldEmail}`} style={link}>
              {oldEmail}
            </Link>{' '}
            para{' '}
            <Link href={`mailto:${newEmail}`} style={link}>
              {newEmail}
            </Link>
            .
          </Text>
          <Button style={button} href={confirmationUrl}>
            Confirmar novo e-mail
          </Button>
          <Hr style={divider} />
          <Text style={footer}>
            Se você não pediu esta alteração, proteja sua conta agora trocando
            a senha.
          </Text>
        </Section>
      </Container>
    </Body>
  </Html>
)

export default EmailChangeEmail
