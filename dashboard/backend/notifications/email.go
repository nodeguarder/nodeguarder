package notifications

import (
	"crypto/tls"
	"fmt"
	"net/smtp"
	"strings"
)

type EmailProvider struct {
	Server     string
	Port       int
	User       string
	Password   string
	Recipients []string
}

func NewEmailProvider(server string, port int, user, password string, recipients []string) *EmailProvider {
	return &EmailProvider{
		Server:     server,
		Port:       port,
		User:       user,
		Password:   password,
		Recipients: recipients,
	}
}

func (p *EmailProvider) Name() string {
	return "Email"
}

func (p *EmailProvider) Send(n Notification) error {
	if p.Server == "" || len(p.Recipients) == 0 {
		return nil
	}

	addr := fmt.Sprintf("%s:%d", p.Server, p.Port)

    // 1. Connect to the server
	client, err := smtp.Dial(addr)
	if err != nil {
		return fmt.Errorf("failed to connect to SMTP server: %v", err)
	}
	defer client.Quit()

    // 2. StartTLS (Required for Port 587/Gmail)
    // We force it for 587 to ensure we don't accidentally send credentials in plain text
    // if the server banner is weird.
	if p.Port == 587 || p.Port == 25 {
        // Try to upgrade
        config := &tls.Config{
            ServerName: p.Server,
        }
        // We ignore the error if STARTTLS isn't supported ONLY if not 587. 
        // For 587 we expect it.
        if err = client.StartTLS(config); err != nil {
             if p.Port == 587 {
                 return fmt.Errorf("failed to execute StartTLS: %v", err)
             }
             // For port 25, we continue (opportunistic)
        }
	}

    // 3. Authenticate
	if p.User != "" && p.Password != "" {
		auth := smtp.PlainAuth("", p.User, p.Password, p.Server)
		if err = client.Auth(auth); err != nil {
			return fmt.Errorf("failed to authenticate: %v", err)
		}
	}

    // 4. Send Mail
	toHeader := strings.Join(p.Recipients, ",")
	msg := []byte(fmt.Sprintf("To: %s\r\n"+
		"Subject: [%s] %s\r\n"+
		"\r\n"+
		"%s\r\n", toHeader, n.Type, n.Subject, n.Message))

	if err = client.Mail(p.User); err != nil {
		return fmt.Errorf("failed to set sender: %v", err)
	}
	for _, r := range p.Recipients {
		if err = client.Rcpt(r); err != nil {
			return fmt.Errorf("failed to add recipient %s: %v", r, err)
		}
	}
	w, err := client.Data()
	if err != nil {
		return fmt.Errorf("failed to get data writer: %v", err)
	}
	_, err = w.Write(msg)
	if err != nil {
		return fmt.Errorf("failed to write message: %v", err)
	}
	err = w.Close()
	if err != nil {
		return fmt.Errorf("failed to close data writer: %v", err)
	}

	return nil
}
