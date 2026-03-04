const QRCode = require("qrcode");
const { generateTicketCode } = require("../utils");

/**
 * Générer un QR code en base64
 * @param {string} ticketCode - Code unique du billet
 * @returns {Promise<string>} - Image QR code en base64
 */
const generateQRCode = async (ticketCode) => {
  try {
    const qrData = JSON.stringify({
      code:    ticketCode,
      app:     "evolyx-events",
      version: "1.0",
    });

    const qrBase64 = await QRCode.toDataURL(qrData, {
      errorCorrectionLevel: "H",
      margin:               2,
      width:                300,
      color: {
        dark:  "#000000",
        light: "#FFFFFF",
      },
    });

    return qrBase64;
  } catch (err) {
    throw new Error(`Erreur génération QR code : ${err.message}`);
  }
};

/**
 * Préparer les données complètes d'un billet
 * @param {Object} registration - Inscription
 * @param {Object} event        - Événement
 * @param {Object} ticketType   - Type de billet
 * @returns {Promise<Object>}   - Données billet avec QR code
 */
const prepareTicketData = async (registration, event, ticketType) => {
  const qrCode = await generateQRCode(registration.ticket_code);

  return {
    ticket_code:  registration.ticket_code,
    qr_code:      qrCode,
    participant: {
      first_name: registration.first_name,
      last_name:  registration.last_name,
      email:      registration.email,
      phone:      registration.phone,
    },
    event: {
      title:      event.title,
      start_date: event.start_date,
      end_date:   event.end_date,
      location:   event.address || event.online_url,
      district:   event.district,
      city:       event.city,
    },
    ticket: {
      name:        ticketType.name,
      price:       ticketType.price,
      currency:    ticketType.currency,
      amount_paid: registration.amount_paid,
    },
    status:     registration.status,
    created_at: registration.created_at,
  };
};

module.exports = { generateQRCode, prepareTicketData };