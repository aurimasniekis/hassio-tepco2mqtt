#!/usr/bin/env bashio

bashio::log.info "Preparing to start..."

bashio::config.require 'data_path'

# Socat

export TEPCO2MQTT_DATA="$(bashio::config 'data_path')"
if ! bashio::fs.file_exists "$TEPCO2MQTT_DATA/configuration.yaml"; then
    mkdir -p "$TEPCO2MQTT_DATA" || bashio::exit.nok "Could not create $TEPCO2MQTT_DATA"

    cat <<EOF > "$TEPCO2MQTT_DATA/configuration.yaml"
advanced:
  log_level: info
EOF
fi

if bashio::config.has_value 'watchdog'; then
    export T2M_WATCHDOG="$(bashio::config 'watchdog')"
    bashio::log.info "Enabled Tepco2MQTT watchdog with value '$T2M_WATCHDOG'"
fi

export NODE_PATH=/app/node_modules

# Expose addon configuration through environment variables.
function export_config() {
    local key=${1}
    local subkey

    if bashio::config.is_empty "${key}"; then
        return
    fi

    for subkey in $(bashio::jq "$(bashio::config "${key}")" 'keys[]'); do
        export "TEPCO2MQTT_CONFIG_$(bashio::string.upper "${key}")_$(bashio::string.upper "${subkey}")=$(bashio::config "${key}.${subkey}")"
    done
}

export_config 'mqtt'
export_config 'browser'
export_config 'tepco'

if (bashio::config.is_empty 'mqtt' || ! (bashio::config.has_value 'mqtt.server' || bashio::config.has_value 'mqtt.username' || bashio::config.has_value 'mqtt.password')) && bashio::var.has_value "$(bashio::services 'mqtt')"; then
    if bashio::var.true "$(bashio::services 'mqtt' 'ssl')"; then
        export TEPCO2MQTT_CONFIG_MQTT_SERVER="mqtts://$(bashio::services 'mqtt' 'host'):$(bashio::services 'mqtt' 'port')"
    else
        export TEPCO2MQTT_CONFIG_MQTT_SERVER="mqtt://$(bashio::services 'mqtt' 'host'):$(bashio::services 'mqtt' 'port')"
    fi
    export TEPCO2MQTT_CONFIG_MQTT_USERNAME="$(bashio::services 'mqtt' 'username')"
    export TEPCO2MQTT_CONFIG_MQTT_PASSWORD="$(bashio::services 'mqtt' 'password')"
fi

bashio::log.info "Starting Tepco2MQTT..."
cd /app
exec node bin/tepco2mqtt.mjs
