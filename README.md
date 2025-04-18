# TF2 Trading Bot
<div align="center"><img src="https://github.com/jack-richards/bptf-autopricer/assets/58331725/203fe808-30ff-4d7d-868c-a3ef6d31497d" alt="logo" style="width: 280px; height: 320px; display: block; margin-left: auto; margin-right: auto;"></div>

#
<div align="center">
  
[![Version](https://img.shields.io/github/v/release/jack-richards/tf2-trading-bot.svg)](https://github.com/jack-richards/tf2-trading-bot/releases)
[![GitHub forks](https://img.shields.io/github/forks/jack-richards/tf2-trading-bot)](https://github.com/jack-richards/tf2-trading-bot/network/members)
[![GitHub Repo stars](https://img.shields.io/github/stars/jack-richards/tf2-trading-bot)](https://github.com/jack-richards/tf2-trading-bot/stargazers)
[![GitHub issues](https://img.shields.io/github/issues/jack-richards/tf2-trading-bot)](https://github.com/jack-richards/tf2-trading-bot/issues)
[![License](https://img.shields.io/github/license/jack-richards/tf2-trading-bot.svg)](https://opensource.org/licenses/MIT)
[![Known Vulnerabilities](https://snyk.io/test/github/jack-richards/tf2-trading-bot/badge.svg)](https://snyk.io/test/github/jack-richards/tf2-trading-bot)

</div>

TF2 Trading Bot is a fully automated trading bot built to work seamlessly with the tf2-automatic platform. The bot listens for events from tf2-automatic, processes trade offers, manages inventory, and handles listings using bptf-manager for backpack.tf interactions.

The bot leverages my [bptf-autopricer application](https://github.com/jack-richards/bptf-autopricer/tree/tf2-trading-bot) to provide accurate and competitive real-time pricing data. Together, these components form a comprehensive, end-to-end solution for TF2 trade automation, being designed with dual usage in mind.

To set up the bot, you will need to configure the following:
- tf2-automatic bot
- tf2-automatic bot manager
- bptf-manager
- bptf-autopricer

Detailed instructions on setting up these requirements will be provided further down.

## Features

### ⚡ **Blazing Fast Trade Processing**
   - The bot processes trade offers quickly, ensuring minimal delay in evaluating and responding to incoming trade events. This allows for efficient and timely trades.
   - Processes incoming trade offers, using pricing data from **bptf-autopricer** to determine whether a trade is favourable or not.

### 🛒 **Listing Management**
   - **Create, Delete, and Update Listings**: The bot manages **backpack.tf** listings based on real-time trade events, ensuring items are listed or removed accordingly.

### ⚙️ **Automatic Metal Crafting**
   - The bot crafts metal automatically after each trade to maintain configured minimum metal amounts.

### 🤖 Integration with bptf-autopricer
   - The bot integrates seamlessly with my battle-tested [bptf-autopricer](https://github.com/jack-richards/bptf-autopricer/tree/tf2-trading-bot) application to provide accurate and competitive pricing. This ensures that the bot stays up-to-date with current market trends and can evaluate trade offers effectively.
   - Additionally, bptf-autopricer serves as the central interface for managing the bot’s inventory preferences. Users can easily add or remove items to buy and sell (and have them autopriced) directly through bptf-autopricer, streamlining the pricelist configuration process.
     
### 🔑 **Autokeys**
   - Automatically creates **buy** and **sell listings** for keys based on the number of keys and refined metal in your inventory.
     - E.g., A key listing will be created selling _n_ keys when the bot has _n_ keys over its configured maximum amount and less than its minimum refined metal amount.
   - Minimum and maximums are fully configurable via the `autokeys.json` config file.

### 💰 **Partial Pricing for Minimum Profit**
   - Protects against selling an item for less than the price it was bought for, particularly in response to changing market conditions. The bot adjusts the selling price to the item's purchase price plus 1 scrap (0.11 refined).
   - The duration an item remains "partially priced" can be configured in the `partialPricing.json` config file.

### ❌ **Trade Validation and User Ban Checking**
   - Rejects trade offers from banned users, ensuring that the bot does not get banned through interacting with these known bad-actors.

### 📦 **Inventory Management**
   - Tracks "in-use" items during active trades, preventing them from being used for crafting or other trades. Thereby ensuring trades are less likely to become invalidated through items being traded away before an offer is accepted.

### 📉 **Stock Limit**
   - Currently, the bot will only hold 1 of each item at a time, maintaining a stock limit of 1.
   - This is a static limit because I originally made this bot for my personal use, and found it to be a good set-up. However, feel free to edit the code to change this. 

## **bptf-autopricer**

For more details regarding the pricer, visit my [bptf-autopricer GitHub project page]([https://github.com/jack-richards/bptf-autopricer](https://github.com/jack-richards/bptf-autopricer/tree/tf2-trading-bot)). Make sure to use the version clearly labelled as being for this project (the tf2-trading-bot branch).

### Setup Instructions for **bptf-autopricer**
Official setup instructions for **bptf-autopricer** can be found in the ``README.MD`` file on the [GitHub project page](https://github.com/jack-richards/bptf-autopricer/blob/tf2-trading-bot/README.md).

## Docker & Docker Compose
The **tf2-automatic** applications are distributed via docker files, which require docker to run.  

On Windows, you can download and use [Docker Desktop](https://docs.docker.com/desktop/setup/install/windows-install/).  

On Linux, you can follow this [wiki](https://docs.docker.com/desktop/setup/install/linux/).

Guidance on how to run containers (docker-compose.yml files) can be viewed [here](https://docs.docker.com/get-started/workshop/08_using_compose/#run-the-application-stack). 

## Managing Listings with **bptf-manager**

The **bptf-manager** application, provided by the **tf2-automatic** platform, manages **backpack.tf** listings. The bot communicates with this application to create, delete, and update listings based on trade activity and pricing updates.

### Setup Instructions for **bptf-manager**

1. The official setup for **bptf-manager** can be found in the **tf2-automatic** repository using the recommended **Docker Compose setup** [here](https://github.com/tf2-automatic/tf2-automatic/blob/main/apps/bptf-manager/examples/docker-compose.yml).
2. Alternatively (**and what I would recommend**), you can use the custom Docker Compose setup I provide, which ensures that **bptf-manager** is only accessible to the local network for added security:
   - [Custom Docker Compose File for **bptf-manager**](https://github.com/jack-richards/tf2-trading-bot/blob/main/TF2Automatic%20Docker%20File/bptf-manager/docker-compose.yml)

## Steam Account Interface via **TF2-Automatic Bot & Bot Manager**
The **bot** and **bot manager** applications from the **tf2-automatic** platform must be set up and running for the **tf2-trading-bot** to function properly. These tf2-automatic applications provide crucial events that this application listens for and acts upon, they also provide an API to perform actions like accepting or declining trades.

### Setup Instructions for **tf2-automatic** Bot and Bot Manager

- The recommended Docker setup for these **tf2-automatic** applications can be found in its official repository. Simply download, configure, and run the [Docker Compose file](https://github.com/tf2-automatic/tf2-automatic/blob/main/examples/recommended-setup/docker-compose.yml).
- Alternatively (**and what I would recommend**), you can use the [Custom Docker Compose File for **tf2-automatic** Bot and Bot Manager](https://github.com/jack-richards/tf2-trading-bot/blob/main/TF2Automatic%20Docker%20File/bot-and-manager/docker-compose.yml) I provide, which ensures that the **bot manager and bot** applications are only accessible to the local network for added security.

## Setup

### Prerequisites

Before downloading & setting up the TF2 Trading Bot, make sure you have the following installed:

1. **Node.js (LTS Version)**  
   The bot is built on Node.js. You need the LTS (Long Term Support) version.  
   Install from [Node.js](https://nodejs.org/) (or via a package manager if on Linux) and verify the installation:

2. **NPM**  
    NPM is bundled with Node.js, and you need it to install dependencies for the bot. Verify it’s installed:
    ```
    npm --version
    ```

3. **PostgreSQL**  
   The bot requires a PostgreSQL database to store data.
   Install the database, the exact method changes depending on your operating system, so refer to an external guide for this.

4. **Git**
    You need Git to clone the repository.
    On Windows install from the Git website, on Linux based systems, I believe it comes pre-installed. To verify that its installed run:
    ```bash
    git --version
    ```

## Download & Installation
**Before continuing**, make sure you have correctly configured, downloaded, and are able to run the tf2automatic bot, manager, and bptf-manager applications. Furthermore, ensure you have installed and configured the bptf-autopricer and followed all its set-up instructions, e.g., the database set-up.

---

Now that all the prerequisites are met both in terms of applications required and packages, we can clone the **tf2-trading-bot** git repository from within a terminal using the command:

```bash
git clone https://github.com/jack-richards/tf2-trading-bot.git
```

Next we move into the new directory and run:
```bash
npm install
```
This will download all the npm packages required by tf2-trading-bot.

Then run the following command to build the TypeScript project:
```bash
npm run build
```

You should find a newly created ``/dist`` directory.

The application requires a PostgreSQL database called ``trading_bot`` with a schema called ``tf2``. If you correctly followed the set-up instructions for the bptf-autopricer project, these requirements should already be met.

At this point you need to adjust the config files within the /config directory. See the section below for more information.


### Configuration

You will need to configure the JSON files contained within the ``/config`` folder. Each file contains placeholders most of which can be left the same but some will need changing e.g., database password.

I will not cover config files here that are entirely self-explanatory.

### 1. **autokeys.json**
This file controls the key-related settings. You can modify the values or leave them as the default:

```json
{
  "minKeys": 20,
  "maxKeys": 200,
  "minRef": 200,
  "maxRef": 400
}
```
- minKeys: Minimum number of keys the bot will attempt to have at a given time.
- maxKeys: Maximum number of keys the bot will hold, with the overflow being sold based on whether more refined is needed or not.
- minRef: Minimum amount of refined metal the bot will attempt to have at a given time.
- maxRef: Maximum amount of refined metal the bot will hold, with the overflow being potentially used to buy keys if required.

### 2. **bot.json**
```json
{
  "steamid": "your bots steam id 64",
  "token": "your bots bptf token",
  "apiKey": "your bots bptf api key",
  "userAgent": "",
  "host": "127.0.0.1",
  "port": 9876,
  "buyDetails": "Buying %amount% %item% for %price%.",
  "sellDetails": "Selling %amount% %item% for %price%."
}
```
- steamid: Your bot's Steam64 ID.
- token: Backpack.tf API token.
- apiKey: Backpack.tf API key.
- host and port: Local server details for communication. If following standard set-up should leave this as default.
- buyDetails and sellDetails: Message templates for listings. 
  - %amount% = amount of the item the bot is selling or buying.
  - %item% = the name of the item.
  - %price% = the price of the item in keys and ref.
  - For example, if the bot was selling a Team Captain, it would state: Selling 1 Team Captain for 22 refined.

### 3. **crafting.json**
This file defines crafting rules for the bot. Modify as needed:

```json
{
  "minScrap": 12,
  "minReclaimed": 12
}
```
- minScrap: Amount of scrap we want to maintain at a minimum in our inventory.
- minReclaimed: Amount of reclaimed we want to maintain at a minimum in our inventory.

### 4. **database.json**
This file contains the database connection settings. Update the connection details to match your PostgreSQL configuration:

```json
{
  "schema": "tf2",
  "host": "localhost",
  "port": 5432,
  "name": "trading_bot",
  "user": "postgres",
  "password": "your database password"
}
```
**Note** that we are using the same schema as the one used in the bptf-autopricer project. If you have followed the setup instructions for that project, you should already have the schema `tf2` created, same with the database `trading_bot`.

### 5. **mptf.json**
```json
{
  "apiKey": "your marketplace.tf api key"
}
```
- apiKey: If you are a seller on marketplace.tf an API key should be available to you. This is used to check whether a user we're trading with is banned on marketplace.tf or not.
  - If you are not a seller and can't provide an API key, leave this field **blank** like shown below:

```json
{
    "apiKey": ""
}
```

### 6. **partialPricing.json**
```json
{
  "partialPricingMaxAgeInDays": 7
}
```
- partialPricingMaxAgeInDays: Maximum age in days a item will be partially priced for.

## Running the Trading Bot
Now that the bot is configured, re-run the build command in the top-level of the project:
```bash
npm run build
```
Launch the bot, bot manager and bptf-autopricer applications.

After, change directories within the terminal to ``dist/src/``, here you should find the file app.js, the entry-point to the application.
  
To launch the **tf2-trading-bot** run:
```bash
node app.js
```

**As an alternative** to running the application directly with node, I would recommend using [PM2](https://pm2.keymetrics.io/), once it has been installed run:
```bash
pm2 start app.js
```
When you run:
```bash
pm2 list
```
You should see the trading bot as one of the processes, you can shut it down with ``pm2 stop [application name]`` or ``pm2 delete [application name]``

## How to add items to buy & sell?
Add the item to be priced by the bptf-autopricer application through one of the methods shown [here](https://github.com/jack-richards/bptf-autopricer/tree/tf2-trading-bot?tab=readme-ov-file#adding-items-to-price).

## How do I stop banking an item?
Follow the guidance [here](https://github.com/jack-richards/bptf-autopricer/tree/tf2-trading-bot?tab=readme-ov-file#to-stop-banking-an-item).

## ⭐ Show Your Support
If you find the project useful, please consider leaving a star! ⭐
