import puppeteer from 'puppeteer'
import fs from 'fs'
import path from 'path'

const SESSION_PATH = './session.json'

import 'dotenv/config'

async function saveSession(page) {
  const cookies = await page.cookies()
  const localStorageData = await page.evaluate(() => {
    let data = {}
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      data[key] = localStorage.getItem(key)
    }
    return data
  })

  fs.writeFileSync(
    SESSION_PATH,
    JSON.stringify({ cookies, localStorage: localStorageData }, null, 2)
  )
}

async function loadSession(page) {
  if (!fs.existsSync(SESSION_PATH)) return

  const session = JSON.parse(fs.readFileSync(SESSION_PATH))

  // Restaurar cookies
  await page.setCookie(...session.cookies)

  // Restaurar localStorage
  await page.goto('https://facebook.com', { waitUntil: 'domcontentloaded' })
  await page.evaluate((localStorageData) => {
    for (const key in localStorageData) {
      localStorage.setItem(key, localStorageData[key])
    }
  }, session.localStorage)
}

let browser = await puppeteer.launch({ headless: false, defaultViewport: null })
let page = await browser.newPage()

export async function handleMarketplace(data) {
  browser = await puppeteer.launch({ headless: false, defaultViewport: null })
  page = await browser.newPage()

  await page.goto('https://facebook.com', { waitUntil: 'domcontentloaded' })
  await loadSession(page)

  if ((await page.content()).includes('email')) {
    console.log('⏳ Faça login manualmente...')
    await page.waitForNavigation({ waitUntil: 'networkidle0' })
    await saveSession(page)
    console.log('✅ Sessão salva!')
  } else {
    console.log('🔓 Sessão restaurada!')
  }

  console.log('⏳ Faça login manualmente e pressione Enter no terminal quando estiver logado...')
  process.stdin.resume()
  await new Promise(resolve => process.stdin.once('data', resolve))

  await page.goto('https://www.facebook.com/marketplace/create/vehicle', {
    waitUntil: 'networkidle2',
  })

  await handleSelect(process.env.MARKETPLACE_TYPE_CAR, process.env.MARKETPLACE_TYPE_CAR_VALUE)

  handleUploadImages()

  const { year, mark, version, price, km, type_gear, type_fuel, color } = data

  await handleSelect(process.env.MARKETPLACE_YEAR, year.split('/').pop())
  await handleSelect(process.env.MARKETPLACE_MARK, capitalizeWords(mark))
  await handleInput(process.env.MARKETPLACE_VERSION, version)
  await handleInput(process.env.MARKETPLACE_PRICE, String(Number(price.replace(',00', '').replace(/\D/g, ''))+1000))
  await handleInput(process.env.MARKETPLACE_KM, km.replace(/\D/g, ''))
  await handleSelect(process.env.MARKETPLACE_TYPE_GEAR, `Transmissão ${type_gear.toLowerCase()}`)
  await handleSelect(process.env.MARKETPLACE_COLOR, color)
  await handleSelect(process.env.MARKETPLACE_TYPE_FUEL, type_fuel)
  await handleSelect(process.env.MARKETPLACE_STATUS_CAR, 'Excelente')
  await handleTextArea(handleDescriptionCarGPT(data))

  console.log('✅ Campos preenchidos! Finalize manualmente a publicação.')
}

const imageDir = './src/images'

async function handleUploadImages() {
  await page.waitForSelector('input[type="file"]', { timeout: 10000 });

  const imagePaths = fs
    .readdirSync(imageDir)
    .filter(file => /\.(jpe?g|png|webp)$/i.test(file))
    .map(file => path.resolve(imageDir, file));

  const input = await page.$('input[type="file"]');
  if (!input) {
    throw new Error('❌ Campo de upload não encontrado.');
  }

  await input.uploadFile(...imagePaths);
}

async function handleSelect(label, value) {
  await page.waitForSelector('span', { timeout: 10000 });

  await page.evaluate((labelText) => {
    const spans = [...document.querySelectorAll('span')];
    const target = spans.find(span => span.textContent === labelText);
    if (target) target.click();
  }, label);

  await new Promise(resolve => setTimeout(resolve, 1000));

  await page.evaluate((valueText) => {
    const options = [...document.querySelectorAll('span')];
    const option = options.find(span => span.textContent.includes(valueText));
    if (option) option.click();
  }, value);
}

async function handleInput(label, value) {
  if (label.trim().toLowerCase() === 'localização') {
    console.warn(`⛔ Campo "${label}" deve ser preenchido com handleLocation()`);
    return;
  }

  await page.evaluate((labelText) => {
    const allInputs = Array.from(document.querySelectorAll('input')).filter(input =>
      input.type !== 'file' &&
      input.offsetParent !== null &&
      !input.disabled
    );

    for (const input of allInputs) {
      const parent = input.closest('div');
      if (!parent) continue;

      const spans = Array.from(parent.querySelectorAll('span'));
      const hasLabel = spans.some(span =>
        span.textContent.trim().toLowerCase() === labelText.trim().toLowerCase()
      );

      if (hasLabel) {
        input.setAttribute('data-temp-id', 'input-temp');
        break;
      }
    }
  }, label);

  const inputHandle = await page.$('input[data-temp-id="input-temp"]');
  if (!inputHandle) {
    console.warn(`⚠️ Campo para "${label}" não encontrado ou visível.`);
    return;
  }

  await inputHandle.click({ clickCount: 3 });
  await page.keyboard.press('Backspace');
  await inputHandle.type(value, { delay: 20 });

  await page.evaluate(() => {
    const temp = document.querySelector('input[data-temp-id="input-temp"]');
    if (temp) temp.removeAttribute('data-temp-id');
  });
}

async function handleTextArea(texto) {
  await page.waitForSelector('textarea', { visible: true, timeout: 30000 });

  const textarea = await page.$('textarea');
  if (!textarea) {
    console.warn('❌ <textarea> da Descrição não encontrado.');
    return;
  }

  await textarea.click({ clickCount: 3 });
  await page.keyboard.press('Backspace');
  await textarea.type(texto, { delay: 15 });

  console.log('✅ Campo "Descrição" preenchido com sucesso.');
}

function capitalizeWords(text) {
  return text
    .toLowerCase()
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function handleDescriptionCarGPT({ version, year, km, price }) {
  return `${version} - ${year} ${Number(km.replace(/\D/g, '')) < Number(process.env.MAX_KM) ? `- ${km}` : ""}\n\nIMPECÁVEL E COM CAUTELAR APROVADA\n\nPOSSUI GARANTIA\n\nPEGO SEU CARRO OU MOTO NA TROCA\n\n\PARA MAIORES INFORMAÇÕES ${process.env.NUMBER_PHONE}\n\nPROESTE RENAULT MARILIA`
}