import readline from 'readline'
import { handleMainApp } from './index.js'

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
})

function ask(question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer.trim())
    })
  })
}

async function main() {
  console.clear()
  console.log('🔧 Iniciando...\n')

  const _enterprise = await ask('Qual é a empresa? ')
  const _carLicense = await ask('Qual é os últimos 4 digitos da placa do carro? ')

  const enterprise = _enterprise.toLowerCase().trim()
  const carLicense = _carLicense.trim()

  rl.close()

  await handleMainApp(enterprise.toLowerCase(), `XXX${carLicense}`)
}

main()