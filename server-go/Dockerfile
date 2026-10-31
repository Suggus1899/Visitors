FROM golang:1.27.3-bookworm@sha256:d9b6a1beb9474adc2a1ce842573639b44b2a0dd49b6669f51d3821baf9ec37c9 AS build
WORKDIR /src
COPY server-go/go.mod server-go/go.sum ./
RUN go mod download && go mod verify
COPY server-go/ ./
RUN CGO_ENABLED=0 go build -trimpath -o /logmaster ./cmd/logmaster
RUN CGO_ENABLED=0 go build -trimpath -o /logmaster-lab ./cmd/lab

FROM postgres:16-bookworm@sha256:0ea6700a3b4f0ae6ce746519073558aed4d88a79d8d07622a9a644946c7319c4
RUN mkdir -p /var/lib/logmaster/backups /var/lib/logmaster/passwords /var/lib/logmaster/work && chown -R 10001:10001 /var/lib/logmaster
COPY --from=build /logmaster /usr/local/bin/logmaster
COPY --from=build /logmaster-lab /usr/local/bin/logmaster-lab
USER 10001:10001
ENV DOTENV_CONFIG_PATH=/run/secrets/app_env
ENTRYPOINT ["logmaster"]
CMD ["serve"]
