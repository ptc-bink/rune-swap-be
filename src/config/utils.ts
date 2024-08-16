import * as fs from 'fs';

export const getMockContent = async () => {
    let txId, adminRuneAmount1, adminRuneAmount2, txBuilding;
    const content = fs.readFileSync('./src/config/mock.txt', 'utf8');

    console.log('content :>> ', content);

    const txIdMatch = content.match(/txId\s*=\s*"([^"]+)"/);
    const adminRuneAmount1Match = content.match(/adminRuneAmount1\s*=\s*"([^"]+)"/);
    const adminRuneAmount2Match = content.match(/adminRuneAmount2\s*=\s*"([^"]+)"/);
    const txBuildingMatch = content.match(/txBuilding\s*=\s*"([^"]+)"/);

    if (adminRuneAmount1Match && adminRuneAmount1Match[1]) {
        adminRuneAmount1 = adminRuneAmount1Match[1];
    }
    if (txIdMatch && txIdMatch[1]) {
        txId = txIdMatch[1];
    }
    if (adminRuneAmount2Match && adminRuneAmount2Match[1]) {
        adminRuneAmount2 = adminRuneAmount2Match[1];
    }
    if (txBuildingMatch && txBuildingMatch[1]) {
        txBuilding = txBuildingMatch[1];
    }

    return { content, txId, adminRuneAmount1, adminRuneAmount2, txBuilding }
}

export const updateMockFile = (content: string) => {
    fs.writeFileSync('./src/config/mock.txt', content, 'utf8')
}
