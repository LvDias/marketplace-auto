import puppeteer from "puppeteer"

import fs from 'fs'
import path from 'path'
import https from 'https'
import { handleMarketplace } from "./marketplace.js"

const enterprise = {
  'renault': {
    url: 'https://www.proesterenault.com.br/seminovos'
  },
  'nissan': {
    url: 'https://www.proestenissan.com.br/seminovos/estoque-de-seminovos'
  }
}

let main_browser
let main_page

export async function handleMainApp(website, carPlate) {
  main_browser = await puppeteer.launch({ headless: false })
  main_page = await main_browser.newPage()

  let page = 1
  let doesCarExistsInStock

  while(true) {
    await main_page.goto(`${enterprise[website].url}?page=${page}`, { waitUntil: 'domcontentloaded' })

    const isStockEmpty = await main_page.evaluate(() => {
      return document.body.innerText.includes('Nenhum veículo foi encontrado em nosso estoque.') || document.body.innerText.includes('nenhum veículo foi encontrado em nosso estoque.')
    })

    if(isStockEmpty) {
      await main_browser.close()
      process.exit(0)
    }

    const carStock = website === 'renault' ? await handleAllStockRenault() : await handleAllStockNissan()
    doesCarExistsInStock = await handleCarStock(carStock, carPlate)

    if(!doesCarExistsInStock) {
      page++
      continue
    } else {
      break
    }
  }

  await main_page.goto(doesCarExistsInStock, { waitUntil: 'domcontentloaded' })

  await handleAllInfoCar()

  await main_browser.close()
}

async function handleAllStockNissan() {
  return await main_page.$$eval('.card-stock', (elements) => {
    return elements.map(card => {
      const a = card.querySelector('a.btn.btn-block.stretched-link.btn-link.text-underline.font-size-14')
      return a ? a.href : null
    }).filter(Boolean)
  })
}

async function handleAllStockRenault() {
  return await main_page.$$eval('.card-stock', (elements) => {
    return elements.map(card => {
      const a = card.querySelector('a.c-stock-card__body-vdp-link.h-100')
      return a ? a.href : null
    }).filter(Boolean)
  })
}

async function handleCarStock(links, carPlate) {
  const concurrency = Number(process.env.TOTAL_PAGES_SEARCH)
  let index = 0

  while (index < links.length) {
    const chunk = links.slice(index, index + concurrency)

    const results = await Promise.all(
      chunk.map(async (link) => {
        const page = await main_browser.newPage()
        try {
          await page.goto(link, { waitUntil: 'domcontentloaded' })

          const found = await page.evaluate((plate) => {
            return document.body.innerText.includes(plate)
          }, carPlate)

          if (found) return link
        } catch (error) {
          console.error(error.message)
        } finally {
          await page.close()
        }

        return null
      })
    )

    const foundLink = results.find(Boolean)
    if (foundLink) return foundLink

    index += concurrency
  }

  return null
}

async function handleAllInfoCar() {
  const allInfo = await main_page.evaluate(() => {
    const get = (selector) =>
      document.querySelector(selector)?.innerText.trim() || null

    return {
      mark: get('.vehicle-detail-make'),
      version: get('.vehicle-detail-version'),
      price: get('.vehicle-detail-price'),
      type_gear: get('.char-info-gear .font-size-14'),
      type_fuel: get('.char-info-fuel .font-size-14'),
      km: get('.char-info-mileage .font-size-14'),
      year: get('.char-info-year .font-size-14'),
      color: get('.char-info-color .font-size-14'),
    }
  })

  await handleAllImagesCar()

  await handleMarketplace(allInfo)
}

async function handleAllImagesCar() {
  await main_page.waitForSelector('.carousel-item img.image.w-100', { timeout: 10000 })

  const images = await main_page.$$eval('.carousel-item img.image.w-100', imgs =>
    imgs.map(img => img.getAttribute('src') || img.getAttribute('data-src'))
  )

  await downloadImages(images)
} 

async function downloadImages(urls, destFolder = './src/images') {
  // Limpa a pasta uma única vez
  if (fs.existsSync(destFolder)) {
    const files = fs.readdirSync(destFolder)
    for (const file of files) {
      fs.unlinkSync(path.join(destFolder, file))
    }
  } else {
    fs.mkdirSync(destFolder, { recursive: true })
  }

  // Função auxiliar para baixar uma imagem
  function downloadSingleImage(url) {
    return new Promise((resolve, reject) => {
      const fileName = path.basename(new URL(url).pathname.split('?')[0]) // remove query string
      const filePath = path.join(destFolder, fileName)

      const file = fs.createWriteStream(filePath)
      https.get(url, response => {
        response.pipe(file)
        file.on('finish', () => {
          file.close()
          resolve(filePath)
        })
      }).on('error', err => {
        fs.unlink(filePath, () => {})
        reject(err)
      })
    })
  }

  // Baixa todas as imagens paralelamente
  return Promise.all(urls.map(downloadSingleImage))
}

