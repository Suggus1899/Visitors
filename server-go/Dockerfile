FROM golang:1.27.4-bookworm@sha256:4fa7c968ba93f1635670522dbb01a2c78150443e1385746924566079f36570ea AS build
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
