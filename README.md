<div align="center">
    <h1>Official Tepco2MQTT Home Assistant Add-on</h1>
</div>

## 🚀 Installation Guide

### 1️⃣ **Set Up MQTT Broker (if not already configured)**
- In Home Assistant, navigate to **[Settings → Add-ons → Add-on Store](https://my.home-assistant.io/redirect/supervisor_store/)**.
- Install the **[Mosquitto broker](https://my.home-assistant.io/redirect/supervisor_addon/?addon=core_mosquitto)** add-on.
- Start the broker after installation.

---

### 2️⃣ **Add Tepco2MQTT Repository**
- Return to the **Add-on Store**, click **⋮ → Repositories**, and add:  
  ```
  https://github.com/aurimasniekis/hassio-tepco2mqtt
  ```
- Alternatively, click the button below:  
  [![Add Repository to Home Assistant](https://my.home-assistant.io/badges/supervisor_add_addon_repository.svg)](https://my.home-assistant.io/redirect/supervisor_add_addon_repository/?repository_url=https%3A%2F%2Fgithub.com%2Faurimasniekis%2Fhassio-tepco2mqtt)

- Close the dialog and refresh the Add-on Store.

---

### 3️⃣ **Install Tepco2MQTT**
- Locate **Tepco2MQTT** in the Add-on Store.
- Click **Install** and wait for the installation to complete.

---

### 4️⃣ **Configure the Add-on**
- Go to the **Configuration** tab.

#### **MQTT Settings:**
- If you're **not using the Mosquitto broker add-on**, provide your MQTT details:  
  ```yaml
  server: mqtt://localhost:1883
  username: my_user
  password: "my_password"
  ```
  ⚠️ **Note:** Always enclose `password` in quotes if it contains special characters.

#### **TEPCO Account Settings:**
- Add your TEPCO account credentials:  
  ```yaml
  email: foo@bar.com
  password: "my_password"
  ```

✅ **Tip:** Use secrets from your `secrets.yaml file:  
```yaml
password: '!secret mqtt_pass'
```

⚠️ **CAUTION:** Configuration from the add-on page will override `configuration.yaml`.

---

### 5️⃣ **Start the Add-on**
- Go to **Info** and click **Start**.
- Open the **Log** tab to verify that your TEPCO credentials are valid and contracts are detected.

---

### 6️⃣ **Track Specific Contracts (Optional)**
- To monitor specific contracts, add their IDs under `tepco.contractIds`:  
  ```yaml
  contractIds:
   - '1234'
   - '5678'
     ```

- After confirming the setup, set `tepco.initialRun` to `false` and restart the add-on.

---

## 🛠️ **Troubleshooting**
- Verify MQTT settings and broker connectivity.
- Check logs for errors.
- Restart the add-on after configuration changes.

For detailed documentation and support, visit the [GitHub Repository](https://github.com/aurimasniekis/hassio-tepco2mqtt).

Enjoy seamless TEPCO data integration with Home Assistant! 🚀✨
