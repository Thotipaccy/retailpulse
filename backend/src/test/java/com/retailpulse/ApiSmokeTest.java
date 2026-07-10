package com.retailpulse;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
class ApiSmokeTest {

    @Autowired
    private MockMvc mockMvc;

    @Test
    @WithMockUser(username = "u1", roles = "ADMIN")
    void productsEndpoint() throws Exception {
        mockMvc.perform(get("/api/products")).andExpect(status().isOk());
    }

    @Test
    @WithMockUser(username = "u1", roles = "ADMIN")
    void customerFrequencyEndpoint() throws Exception {
        mockMvc.perform(get("/api/customers/frequency")).andExpect(status().isOk());
    }

    @Test
    @WithMockUser(username = "u1", roles = "ADMIN")
    void customerLtvTrendEndpoint() throws Exception {
        mockMvc.perform(get("/api/customers/ltv-trend")).andExpect(status().isOk());
    }

    @Test
    @WithMockUser(username = "u1", roles = "ADMIN")
    void planningGoalsEndpoint() throws Exception {
        mockMvc.perform(get("/api/planning/goals")).andExpect(status().isOk());
    }

    @Test
    @WithMockUser(username = "u1", roles = "ADMIN")
    void dataSourcesEndpoint() throws Exception {
        mockMvc.perform(get("/api/data/sources")).andExpect(status().isOk());
    }

    @Test
    @WithMockUser(username = "u1", roles = "ADMIN")
    void forecastAccuracyEndpoint() throws Exception {
        mockMvc.perform(get("/api/forecast/accuracy")).andExpect(status().isOk());
    }

    @Test
    @WithMockUser(username = "u1", roles = "ADMIN")
    void inventoryVelocityEndpoint() throws Exception {
        mockMvc.perform(get("/api/inventory/velocity")).andExpect(status().isOk());
    }

    @Test
    @WithMockUser(username = "u1", roles = "ADMIN")
    void recommendationsFbtEndpoint() throws Exception {
        mockMvc.perform(get("/api/recommendations/fbt")).andExpect(status().isOk());
    }

    @Test
    @WithMockUser(username = "u1", roles = "ADMIN")
    void adminBackupsEndpoint() throws Exception {
        mockMvc.perform(get("/api/admin/backups")).andExpect(status().isOk());
    }
}
