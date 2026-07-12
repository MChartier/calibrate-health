package app.calibratehealth.wear.sync

import app.calibratehealth.wear.data.FakeMutationOutboxRepository
import app.calibratehealth.wear.data.FakeWearStorage
import app.calibratehealth.wear.data.local.QueuedMutationEntity
import app.calibratehealth.wear.data.FakeSecureTokenStore
import app.calibratehealth.wear.data.security.SecureSession
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class OutboxProcessorTest {
    @Test
    fun `retry blocks later mutations and preserves the operation id`() = runBlocking {
        val repository = FakeMutationOutboxRepository(FakeWearStorage())
        repository.enqueue(mutation("a", 100))
        repository.enqueue(mutation("b", 200))
        repository.enqueue(mutation("c", 300))
        val sent = mutableListOf<String>()
        val processor = FifoOutboxProcessor(
            repository = repository,
            sender = MutationSender { mutation, _ ->
                sent += mutation.operationId
                if (mutation.operationId == "b") MutationSendResult.Retryable("offline")
                else MutationSendResult.Success
            },
            tokenStore = tokenStore()
        )

        assertEquals(OutboxDrainResult.Retry, processor.drain())
        assertEquals(listOf("a", "b"), sent)
        assertEquals("offline", repository.head()?.lastError)
        assertEquals(1, repository.head()?.attemptCount)
        assertEquals("b", repository.head()?.operationId)
    }

    @Test
    fun `healthy batch continuation is not reported as retry`() = runBlocking {
        val repository = FakeMutationOutboxRepository(FakeWearStorage())
        repository.enqueue(mutation("a", 100))
        repository.enqueue(mutation("b", 200))
        val processor = FifoOutboxProcessor(
            repository = repository,
            sender = MutationSender { _, _ -> MutationSendResult.Success },
            tokenStore = tokenStore(),
            maxMutationsPerRun = 1
        )

        assertEquals(OutboxDrainResult.Continue, processor.drain())
        assertEquals("b", repository.head()?.operationId)
    }

    @Test
    fun `permanent failure does not block later mutations`() = runBlocking {
        val repository = FakeMutationOutboxRepository(FakeWearStorage())
        repository.enqueue(mutation("a", 100))
        repository.enqueue(mutation("b", 200))
        val processor = FifoOutboxProcessor(
            repository = repository,
            sender = MutationSender { mutation, _ ->
                if (mutation.operationId == "a") MutationSendResult.PermanentFailure("invalid")
                else MutationSendResult.Success
            },
            tokenStore = tokenStore()
        )

        assertEquals(OutboxDrainResult.Complete, processor.drain())
        assertEquals(null, repository.head())
    }

    @Test
    fun `conflict is terminal and does not block later mutations`() = runBlocking {
        val repository = FakeMutationOutboxRepository(FakeWearStorage())
        repository.enqueue(mutation("a", 100))
        repository.enqueue(mutation("b", 200))
        val processor = FifoOutboxProcessor(
            repository = repository,
            sender = MutationSender { mutation, _ ->
                if (mutation.operationId == "a") MutationSendResult.Conflict("stale revision")
                else MutationSendResult.Success
            },
            tokenStore = tokenStore()
        )

        assertEquals(OutboxDrainResult.Complete, processor.drain())
        assertEquals(null, repository.head())
    }

    @Test
    fun `account switch during send leaves the captured mutation untouched`() = runBlocking {
        val storage = FakeWearStorage()
        val repository = FakeMutationOutboxRepository(storage)
        repository.enqueue(mutation("a", 100))
        val tokenStore = FakeSecureTokenStore(FakeWearStorage().apply { secureSession = session() })
        val processor = FifoOutboxProcessor(
            repository = repository,
            sender = MutationSender { _, _ ->
                tokenStore.write(session().copy(userId = 99))
                MutationSendResult.Success
            },
            tokenStore = tokenStore
        )

        assertEquals(OutboxDrainResult.AccountChanged, processor.drain())
        assertEquals("a", repository.head()?.operationId)
    }

    @Test
    fun `operation id is assigned once when mutation is created`() {
        val factory = QueuedMutationFactory(
            operationIds = OperationIdFactory { "stable-operation-id" },
            nowEpochMs = { 42 }
        )
        val mutation = factory.create("weight.create", "{}")
        assertEquals("stable-operation-id", mutation.operationId)
        assertEquals(42L, mutation.createdAtEpochMs)
        assertTrue(mutation.attemptCount == 0)
    }

    private fun mutation(id: String, createdAt: Long) = QueuedMutationEntity(
        operationId = id,
        mutationType = "food.create",
        payloadJson = "{}",
        createdAtEpochMs = createdAt
    )

    private fun tokenStore() = FakeSecureTokenStore(FakeWearStorage().apply { secureSession = session() })

    private fun session() = SecureSession(
        accessToken = "access",
        refreshToken = "refresh",
        userId = 7,
        serverOrigin = "https://health.example.com",
        watchDeviceId = "watch-7",
        accessExpiresAtEpochMs = 100_000,
        refreshExpiresAtEpochMs = 200_000
    )
}
