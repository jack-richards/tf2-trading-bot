import axios from 'axios';

/** 
   This class was inspired by and heavily adapted from Ban.ts from the project tf2autobot.
   Original Project: https://github.com/TF2Autobot/tf2autobot
   Relevant File: https://github.com/TF2Autobot/tf2autobot/blob/master/src/lib/bans.ts
   
   To comply with the terms of the MIT License, a copy of the license from the 
   tf2autobot project is included below:

    MIT License

    Copyright (c) 2020 - 2022 TF2Autobot/IdiNium

    Permission is hereby granted, free of charge, to any person obtaining a copy
    of this software and associated documentation files (the "Software"), to deal
    in the Software without restriction, including without limitation the rights
    to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
    copies of the Software, and to permit persons to whom the Software is
    furnished to do so, subject to the following conditions:

    The above copyright notice and this permission notice shall be included in all
    copies or substantial portions of the Software.

    THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
    IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
    FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
    AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
    LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
    OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
    SOFTWARE.
**/

interface SiteResult {
    isBanned: boolean;
    content?: string;
    success: boolean;
}

interface IsBanned {
    isBanned: boolean;
    contents?: { [website: string]: string };
}

export default class Bans {
    private readonly bptfApiKey: string;
    private readonly mptfApiKey: string;
    private readonly userID: string;

    constructor(bptfApiKey: string, mptfApiKey: string, userID: string) {
        this.bptfApiKey = bptfApiKey;
        this.mptfApiKey = mptfApiKey;
        this.userID = userID;
    }

    async isBanned(steamID: string): Promise<IsBanned> {
        const siteResults: SiteResult[] = await Promise.all([
            this.checkBackpackTF(steamID),
            this.checkSteamRep(steamID),
            this.checkAutobotTF(steamID),
            this.checkMarketplaceTF(steamID),
        ]);

        const anySuccessfulCheck = siteResults.some(result => result.success);
        const isBanned = siteResults.some(result => result.success && result.isBanned);

        if (!anySuccessfulCheck) {
            return {
                isBanned: true,
                contents: { error: "Unable to verify ban status due to API failures." }
            };
        }

        const contents = siteResults.reduce((acc, result) => {
            if (result.isBanned && result.content) {
                acc[result.content] = result.content;
            }
            return acc;
        }, {} as { [website: string]: string });

        return { isBanned, contents };
    }

    private async checkBackpackTF(steamID: string): Promise<SiteResult> {
        try {
            const response = await axios.get(`https://api.backpack.tf/api/users/info/v1`, {
                params: {
                    key: this.bptfApiKey,
                    steamids: steamID,
                },
                headers: {
                    'User-Agent': 'SirFroggy@1.0',
                    'Cookie': `user-id=${this.userID}`,
                },
            });

            const user = response.data.users[steamID];
            const isBptfBanned = user.bans && (user.bans.all !== undefined || user.bans['all features'] !== undefined);
            const banReason = user.bans ? user.bans.all?.reason ?? user.bans['all features']?.reason ?? '' : '';

            return { isBanned: isBptfBanned, content: `Backpack.tf: ${banReason}`, success: true };
        } catch (error) {
            console.warn('Failed to get data from Backpack.tf');
            console.error(error);
            return { isBanned: false, success: false };  // Mark as failed
        }
    }

    private async checkSteamRep(steamID: string): Promise<SiteResult> {
        try {
            const response = await axios.get(`https://steamrep.com/api/beta4/reputation/${steamID}`, {
                params: { json: 1 },
            });

            const isSteamRepBanned = response.data.steamrep.reputation?.summary.toLowerCase().includes('scammer');
            const fullRepInfo = response.data.steamrep.reputation?.full ?? '';

            return { isBanned: isSteamRepBanned, content: `SteamRep: ${fullRepInfo}`, success: true };
        } catch (error) {
            console.warn('Failed to get data from SteamRep');
            console.error(error);
            return { isBanned: false, success: false };  // Mark as failed
        }
    }

    private async checkAutobotTF(steamID: string): Promise<SiteResult> {
        try {
            const response = await axios.get(`https://rep.autobot.tf/json/${steamID}`);

            const isBanned = response.data.isBanned || false;
            const banInfo = Object.entries(response.data.contents)
                .filter(([_, result]) => result !== 'Error' && (result as SiteResult)?.isBanned)
                .map(([site, result]) => `${site}: ${(result as SiteResult).content}`)
                .join('; ');

            return { isBanned, content: `Autobot.tf: ${banInfo}`, success: true };
        } catch (error) {
            console.warn('Failed to get data from Autobot.tf');
            console.error(error);
            return { isBanned: false, success: false };  // Mark as failed
        }
    }

    private async checkMarketplaceTF(steamID: string): Promise<SiteResult> {
        try {
            if (this.mptfApiKey === '') {
                throw new Error('Marketplace.tf API key is not set.');
            }
    
            const response = await axios.post('https://marketplace.tf/api/Bans/GetUserBan/v2', null, {
                headers: {
                    'User-Agent': 'SirFroggy@1.0',
                },
                params: {
                    key: this.mptfApiKey,
                    steamid: steamID,
                },
            });
    
            const results = response.data?.results;
    
            if (!Array.isArray(results) || results.length === 0) {
                return { isBanned: false, success: false };
            }
    
            const userResult = results.find(result => result.steamid === steamID);
    
            if (!userResult) {
                return { isBanned: false, success: false };
            }
    
            const isBanned = userResult.banned ?? false;
            const banReason = userResult.ban?.type ?? '';
    
            return { isBanned, content: `Marketplace.tf: ${banReason}`, success: true };
        } catch (error) {
            console.warn('Failed to get data from Marketplace.tf');
            console.error(error);
            return { isBanned: false, success: false };
        }
    }
}
