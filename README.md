# RFID Inventory Management System

Real-time inventory tracking using RFID — built on ESP32 with cloud backend.

## What it does

Scan an RFID tag to add or remove an item from inventory.
System remembers each tag's last state and toggles automatically.
All data synced to cloud database in real time.

## Hardware Stack

| Component | Role |
|-----------|------|
| ESP32 | Main controller + WiFi |
| RC522 RFID Reader | Tag scanning |
| Green LED | Item added indicator |
| Red LED | Item removed indicator |
| Buzzer | Scan confirmation beep |

## Software Stack

| Layer | Technology |
|-------|------------|
| Firmware | Arduino C++ |
| Backend | Node.js + Express |
| Database | MongoDB Atlas |
| Deployment | Vercel |

## How It Works

RFID tag scanned by RC522
ESP32 sends UID to Vercel backend
Backend checks MongoDB for last state
If item was OUT → mark IN → green LED
If item was IN → mark OUT → red LED
Buzzer beeps on every successful scan
Dashboard shows real-time inventory state

## Key Engineering Challenges Solved

ESP32 boot-strapping conflict — GPIO 12 and GPIO 35
caused boot failures. Resolved by reassigning SPI pins.

Toggle ADD/REMOVE logic — same tag toggles state
on each scan without manual mode switching.

WiFi reconnection — auto-reconnect logic added
for reliable cloud sync in poor signal environments.

## Features

- Toggle ADD/REMOVE per RFID tag automatically
- Real-time cloud sync to MongoDB Atlas
- LED indicators for instant visual feedback
- Buzzer confirmation on every scan
- Vercel backend — always online, zero maintenance

## Live Backend

inventory-management-six-liart.vercel.app

## Tech Stack

Arduino C++ · Node.js · Express · MongoDB Atlas · Vercel · ESP32
