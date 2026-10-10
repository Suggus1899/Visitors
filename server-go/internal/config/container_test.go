package config

import "testing"

func TestContainerSeedGuard(t *testing.T) {
	c := Config{Host: "postgres", Port: "5432", Database: "logmaster_pilot", Environment: "development"}
	if !c.LocalDevelopment() {
		t.Fatal("fictitious container pilot rejected")
	}
	c.Environment = "production"
	if c.LocalDevelopment() {
		t.Fatal("production seeding allowed")
	}
	c.Environment = "development"
	c.Database = "company"
	if c.LocalDevelopment() {
		t.Fatal("arbitrary container database allowed")
	}
}
