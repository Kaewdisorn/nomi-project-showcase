# Kill any process holding port 4000
$conn = Get-NetTCPConnection -LocalPort 4000 -ErrorAction SilentlyContinue
if ($conn) {
    Stop-Process -Id $conn.OwningProcess -Force -ErrorAction SilentlyContinue
    Write-Host "Killed process on port 4000 (PID $($conn.OwningProcess))"
} else {
    Write-Host "Port 4000 is free"
}

# Start the microservice in watch mode
npm run start:dev

# To test the microservice, you can run the following command in a separate terminal:
# npx ts-node --project tsconfig.json test/test-client.ts