ARG BUILD_FROM
FROM $BUILD_FROM as base

ENV LANG C.UTF-8

RUN apk add --no-cache tini nodejs eudev chromium-swiftshader ttf-freefont font-noto-emoji && \
    apk add --no-cache \
    --repository=https://dl-cdn.alpinelinux.org/alpine/edge/community \
    font-wqy-zenhei

COPY local.conf /etc/fonts/local.conf

# Dependencies and build
FROM base as dependencies_and_build

COPY ./ /app

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD 1
ENV PUPPETEER_EXECUTABLE_PATH /usr/bin/chromium-browser

RUN apk add --no-cache --virtual .buildtools npm make gcc g++ linux-headers udev git python3 && \
    npm install -g pnpm && \
    jq -n --arg commit $(eval git rev-parse --short HEAD) '$commit' > /app/.hash ; \
    echo "Installed Tepco2MQTT @ version $(cat /app/.hash)" && \
    cd /app && \
    pnpm install --frozen-lockfile --unsafe-perm && \
    pnpm run build && \
    rm -rf node_modules && \
    pnpm install --frozen-lockfile --unsafe-perm --prod

# Release
FROM base as release

ENV CHROME_BIN=/usr/bin/chromium-browser \
    CHROME_PATH=/usr/lib/chromium/

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD 1
ENV PUPPETEER_EXECUTABLE_PATH /usr/bin/chromium-browser

COPY ./docker-entrypoint.sh /
COPY --from=dependencies_and_build /app/dist/tepco2mqtt/ /app
COPY --from=dependencies_and_build /app/node_modules /app/node_modules

WORKDIR /app

ENV NODE_ENV production

ENTRYPOINT [ "/sbin/tini", "--", "/docker-entrypoint.sh"]
