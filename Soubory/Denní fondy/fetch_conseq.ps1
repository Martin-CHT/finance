$url = 'https://www.conseq.cz/fund/getpricehistory'
$body = 'culture=cs-CZ&productId=10079'
$headers = @{
    'Content-Type' = 'application/x-www-form-urlencoded; charset=UTF-8'
}
try {
    $response = Invoke-WebRequest -Uri $url -Method Post -Body $body -Headers $headers
    Write-Host "Success! Status code: " $response.StatusCode
    Write-Host "Length: " $response.RawContentLength
} catch {
    Write-Host "Failed: " $_
}
