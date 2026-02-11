const SibApiV3Sdk = require("sib-api-v3-sdk");

// Initialize the Brevo Client
const defaultClient = SibApiV3Sdk.ApiClient.instance;
const apiKey = defaultClient.authentications["api-key"];
apiKey.apiKey = process.env.BREVO_API_KEY; // Put your real key in Railway Variables

const apiInstance = new SibApiV3Sdk.TransactionalEmailsApi();

async function sendEmail({ to, subject, html, text }) {
  const sendSmtpEmail = new SibApiV3Sdk.SendSmtpEmail();

  sendSmtpEmail.subject = subject;
  sendSmtpEmail.htmlContent = html || text;
  sendSmtpEmail.sender = {
    name: "CovoitAir",
    email: process.env.FROM_EMAIL || "said2000bm@gmail.com",
  };
  sendSmtpEmail.to = [{ email: to }];

  try {
    console.log(`📧 Sending email to: ${to}`);
    console.log(`📧 From: ${sendSmtpEmail.sender.email}`);
    console.log(`📧 Subject: ${subject}`);

    const data = await apiInstance.sendTransacEmail(sendSmtpEmail);
    console.log(
      "✅ Email sent successfully via Brevo API. ID:",
      data.messageId,
    );
    return data;
  } catch (error) {
    // Log the error but don't let it crash the backend
    console.error("❌ Brevo API Error:", error.response?.body || error.message);
    return null;
  }
}

module.exports = { sendEmail };
